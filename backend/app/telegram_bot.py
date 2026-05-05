"""Telegram bot for ЭкспоЛид. Polling-based, runs as background asyncio task.

Heavy `telegram` imports are deferred to start_bot() so the FastAPI process
does not import them when no bot token is configured (saves ~80MB RAM).
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from sqlalchemy.orm import Session

from . import ai
from .config import get_settings
from .db import SessionLocal
from .events import bus
from .models import Contact, Exhibition, TelegramLinkCode, User

if TYPE_CHECKING:
    from telegram import Update
    from telegram.ext import ContextTypes

logger = logging.getLogger("expolid.telegram")


def _alphabet_code(n: int = 6) -> str:
    a = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(a) for _ in range(n))


def issue_link_code(db: Session, user_id: str) -> str:
    """Создать одноразовый код на 30 минут для привязки Telegram."""
    db.query(TelegramLinkCode).filter(
        TelegramLinkCode.user_id == user_id, TelegramLinkCode.used == False  # noqa: E712
    ).update({TelegramLinkCode.used: True})
    code = _alphabet_code()
    while db.query(TelegramLinkCode).filter(TelegramLinkCode.code == code).first():
        code = _alphabet_code()
    rec = TelegramLinkCode(
        user_id=user_id, code=code, used=False,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db.add(rec)
    db.commit()
    return code


# ---------- Bot handlers ----------


def _user_by_chat(db: Session, chat_id: int) -> Optional[User]:
    return db.query(User).filter(User.telegram_chat_id == str(chat_id), User.is_active == True).first()  # noqa: E712


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if not chat:
        return
    args = context.args or []
    code = args[0].strip().upper() if args else ""

    db = SessionLocal()
    try:
        if not code:
            existing = _user_by_chat(db, chat.id)
            if existing:
                await update.message.reply_text(
                    f"Вы уже привязаны как {existing.name}. Используйте /help для списка команд."
                )
            else:
                await update.message.reply_text(
                    "👋 ЭкспоЛид Bot.\n\n"
                    "Чтобы привязать аккаунт: откройте веб-приложение → Настройки → Telegram → Получить код привязки → пришлите сюда:\n\n"
                    "/start КОД"
                )
            return

        rec = (
            db.query(TelegramLinkCode)
            .filter(TelegramLinkCode.code == code, TelegramLinkCode.used == False)  # noqa: E712
            .first()
        )
        if not rec:
            await update.message.reply_text("❌ Код не найден или уже использован.")
            return
        if rec.expires_at and rec.expires_at < datetime.now(timezone.utc):
            await update.message.reply_text("❌ Код истёк, запросите новый.")
            return
        user = db.query(User).filter(User.id == rec.user_id).first()
        if not user:
            await update.message.reply_text("❌ Аккаунт не найден.")
            return
        # Detach any other user from this chat
        db.query(User).filter(User.telegram_chat_id == str(chat.id)).update({User.telegram_chat_id: None})
        user.telegram_chat_id = str(chat.id)
        rec.used = True
        db.commit()
        await update.message.reply_text(
            f"✅ Привязано к {user.name} ({user.email}).\n\n"
            "Отправьте мне:\n"
            "• 📷 фото визитки\n"
            "• 🎙 голосовое сообщение\n"
            "• ✏️ текст с заметкой\n\n"
            "Команды: /last /tasks /help"
        )
    finally:
        db.close()


async def cmd_help(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Команды бота:\n"
        "/start <код> — привязать аккаунт\n"
        "/last — 5 последних контактов\n"
        "/tasks — мои незакрытые задачи\n"
        "Просто пришлите фото/голос/текст — создам контакт."
    )


async def cmd_last(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if not chat:
        return
    db = SessionLocal()
    try:
        u = _user_by_chat(db, chat.id)
        if not u:
            await update.message.reply_text("Сначала привяжите аккаунт: /start <код>")
            return
        rows = (
            db.query(Contact)
            .filter(Contact.company_id == u.company_id if hasattr(Contact, "company_id") else True)
            .order_by(Contact.created_at.desc())
            .limit(5)
            .all()
        )
        if not rows:
            await update.message.reply_text("Пока нет контактов.")
            return
        text = "\n\n".join(
            f"• {c.name or '—'} — {c.contact_company or '—'}\n  {c.status} · {c.phone or ''} {c.email or ''}".strip()
            for c in rows
        )
        await update.message.reply_text(text)
    finally:
        db.close()


async def cmd_tasks(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if not chat:
        return
    db = SessionLocal()
    try:
        u = _user_by_chat(db, chat.id)
        if not u:
            await update.message.reply_text("Сначала привяжите аккаунт: /start <код>")
            return
        from .models import Task
        rows = (
            db.query(Task)
            .filter(
                Task.assignee_user_id == u.id,
                Task.is_done == False,  # noqa: E712
            )
            .order_by(Task.due_date.asc().nulls_last() if hasattr(Task.due_date, "asc") else Task.due_date)
            .limit(10)
            .all()
        )
        if not rows:
            await update.message.reply_text("Нет открытых задач 🎉")
            return
        text = "\n".join(
            f"• {t.title} {('(до ' + t.due_date.strftime('%d.%m %H:%M') + ')') if t.due_date else ''}"
            for t in rows
        )
        await update.message.reply_text(text)
    finally:
        db.close()


async def _create_contact(
    db: Session,
    user: User,
    *,
    card_path: Optional[str] = None,
    voice_path: Optional[str] = None,
    notes_text: Optional[str] = None,
) -> Contact:
    """Создать контакт из Telegram-сообщения. AI используется по возможности."""
    # OCR
    extracted = {}
    if card_path:
        try:
            extracted = await asyncio.get_event_loop().run_in_executor(
                None, ai.extract_business_card, card_path
            ) or {}
        except Exception:  # noqa: BLE001
            extracted = {}
    transcript = ""
    if voice_path:
        try:
            transcript = await asyncio.get_event_loop().run_in_executor(
                None, ai.transcribe_audio, voice_path
            ) or ""
        except Exception:  # noqa: BLE001
            transcript = ""

    summary = ""
    agreements = ""
    next_step = ""
    notes_full = (notes_text or "") + ("\n" + transcript if transcript else "")
    if notes_full.strip():
        try:
            res = await asyncio.get_event_loop().run_in_executor(
                None, ai.analyze_meeting, notes_full
            ) or {}
            summary = res.get("summary", "")
            agreements = res.get("agreements", "")
            next_step = res.get("next_step", "")
        except Exception:  # noqa: BLE001
            pass

    # Active exhibition
    ex = (
        db.query(Exhibition)
        .filter(Exhibition.company_id == user.company_id, Exhibition.is_active == True)  # noqa: E712
        .first()
    )

    c = Contact(
        company_id=user.company_id,
        owner_user_id=user.id,
        exhibition_id=ex.id if ex else None,
        name=extracted.get("name") or "Контакт из Telegram",
        contact_company=extracted.get("contact_company"),
        role_title=extracted.get("role_title"),
        phone=extracted.get("phone"),
        email=extracted.get("email"),
        website=extracted.get("website"),
        telegram=extracted.get("telegram"),
        whatsapp=extracted.get("whatsapp"),
        contact_type="client",
        status="warm",
        summary=summary or None,
        agreements=agreements or None,
        next_step=next_step or None,
        voice_transcript=transcript or None,
        notes_raw=notes_text or None,
        talked_to_card_owner=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    bus.publish(
        user.company_id, "contact.created",
        {
            "id": c.id, "name": c.name, "company": c.contact_company,
            "status": c.status, "ai_score": c.ai_score,
            "by_user_id": user.id, "by_user_name": user.name + " (Telegram)",
        },
    )
    return c


async def _save_telegram_file(file_id: str, suffix: str, ctx: ContextTypes.DEFAULT_TYPE) -> str:
    f = await ctx.bot.get_file(file_id)
    settings = get_settings()
    out_dir = Path(settings.upload_dir) / "telegram"
    out_dir.mkdir(parents=True, exist_ok=True)
    rel = f"telegram/{secrets.token_hex(8)}{suffix}"
    full = Path(settings.upload_dir) / rel
    await f.download_to_drive(custom_path=str(full))
    return str(full)


async def on_photo(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if not chat or not update.message or not update.message.photo:
        return
    db = SessionLocal()
    try:
        u = _user_by_chat(db, chat.id)
        if not u:
            await update.message.reply_text("Сначала /start <код>")
            return
        photo = update.message.photo[-1]
        path = await _save_telegram_file(photo.file_id, ".jpg", ctx)
        caption = update.message.caption or ""
        await update.message.reply_text("⏳ Распознаю…")
        c = await _create_contact(db, u, card_path=path, notes_text=caption or None)
        await update.message.reply_text(
            f"✅ Контакт создан: {c.name}\n{c.contact_company or ''} {c.phone or ''} {c.email or ''}"
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("on_photo failed")
        await update.message.reply_text(f"❌ Ошибка: {e}")
    finally:
        db.close()


async def on_voice(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if not chat or not update.message:
        return
    voice = update.message.voice or update.message.audio
    if not voice:
        return
    db = SessionLocal()
    try:
        u = _user_by_chat(db, chat.id)
        if not u:
            await update.message.reply_text("Сначала /start <код>")
            return
        path = await _save_telegram_file(voice.file_id, ".ogg", ctx)
        await update.message.reply_text("⏳ Расшифровываю…")
        c = await _create_contact(db, u, voice_path=path, notes_text=update.message.caption)
        await update.message.reply_text(
            f"✅ Голосовая заметка сохранена. Контакт: {c.name}\n"
            f"{(c.summary or '')[:200]}"
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("on_voice failed")
        await update.message.reply_text(f"❌ Ошибка: {e}")
    finally:
        db.close()


async def on_text(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if not chat or not update.message or not update.message.text:
        return
    txt = update.message.text.strip()
    if txt.startswith("/"):
        return
    db = SessionLocal()
    try:
        u = _user_by_chat(db, chat.id)
        if not u:
            await update.message.reply_text("Сначала /start <код>")
            return
        c = await _create_contact(db, u, notes_text=txt)
        await update.message.reply_text(f"✅ Контакт создан из заметки: {c.name}")
    finally:
        db.close()


# ---------- Lifecycle ----------

_app: Application | None = None
_task: asyncio.Task | None = None


async def start_bot() -> None:
    global _app, _task
    settings = get_settings()
    token = os.getenv("TELEGRAM_BOT_TOKEN") or getattr(settings, "telegram_bot_token", "")
    if not token:
        logger.info("TELEGRAM_BOT_TOKEN not set — bot disabled")
        return
    if _app is not None:
        return
    # Lazy import — keeps ~80MB out of the FastAPI process when no bot is configured
    from telegram import Update as _Update
    from telegram.ext import Application, CommandHandler, MessageHandler, filters
    application = Application.builder().token(token).build()
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("help", cmd_help))
    application.add_handler(CommandHandler("last", cmd_last))
    application.add_handler(CommandHandler("tasks", cmd_tasks))
    application.add_handler(MessageHandler(filters.PHOTO, on_photo))
    application.add_handler(MessageHandler(filters.VOICE | filters.AUDIO, on_voice))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    _app = application
    await application.initialize()
    await application.start()
    await application.updater.start_polling(drop_pending_updates=True, allowed_updates=_Update.ALL_TYPES)
    logger.info("Telegram bot started")


async def stop_bot() -> None:
    global _app
    if _app is None:
        return
    try:
        await _app.updater.stop()
        await _app.stop()
        await _app.shutdown()
    except Exception:  # noqa: BLE001
        pass
    _app = None
