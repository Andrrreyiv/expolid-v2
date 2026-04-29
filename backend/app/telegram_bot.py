"""Lightweight Telegram bot using httpx long-polling.

Started as a background task in the FastAPI lifespan. No-op when
TELEGRAM_BOT_TOKEN env is missing.

Supported commands:
- /start                   help message + how to pair
- /start <CODE>            pair this Telegram chat with the user that owns CODE
- /help                    list commands
- /tasks                   list open tasks for the paired user
- /contacts                list 10 most recent contacts in the org
- any text message         create a quick "note" contact in the active exhibition
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import Contact, Task, TelegramLink, User

log = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot{token}"


def _secrets_path() -> Path:
    base = Path("/data") if os.path.isdir("/data") else Path("./uploads")
    base.mkdir(parents=True, exist_ok=True)
    return base / ".runtime_secrets.json"


def _read_runtime_secrets() -> dict[str, str]:
    p = _secrets_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


def write_runtime_secret(key: str, value: str) -> None:
    p = _secrets_path()
    data = _read_runtime_secrets()
    data[key] = value
    p.write_text(json.dumps(data))


def get_token() -> str | None:
    return os.getenv("TELEGRAM_BOT_TOKEN") or _read_runtime_secrets().get("TELEGRAM_BOT_TOKEN")


def get_username() -> str | None:
    return os.getenv("TELEGRAM_BOT_USERNAME") or _read_runtime_secrets().get(
        "TELEGRAM_BOT_USERNAME"
    )


def _enabled() -> bool:
    return bool(get_token())


async def _api(client: httpx.AsyncClient, token: str, method: str, **params: Any) -> dict:
    r = await client.post(f"{API_BASE.format(token=token)}/{method}", json=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if not data.get("ok"):
        log.warning("telegram api error %s: %s", method, data)
    return data


async def _send(client: httpx.AsyncClient, token: str, chat_id: int, text: str) -> None:
    try:
        await _api(client, token, "sendMessage", chat_id=chat_id, text=text, parse_mode="HTML")
    except Exception as e:
        log.warning("send failed: %s", e)


async def _user_for_chat(db: AsyncSession, chat_id: int) -> User | None:
    res = await db.execute(select(TelegramLink).where(TelegramLink.telegram_chat_id == chat_id))
    link = res.scalar_one_or_none()
    if link is None or link.paired_at is None:
        return None
    return await db.get(User, link.user_id)


async def _handle_start(
    db: AsyncSession, chat_id: int, username: str | None, args: str
) -> str:
    code = args.strip()
    if not code:
        return (
            "Привет! Я бот ЭкспоЛида.\n\n"
            "Чтобы привязать Telegram к своему аккаунту:\n"
            "1. Откройте приложение → Настройки → Telegram\n"
            "2. Скопируйте код привязки\n"
            "3. Отправьте сюда команду <code>/start КОД</code>"
        )
    res = await db.execute(select(TelegramLink).where(TelegramLink.pairing_code == code))
    link = res.scalar_one_or_none()
    if link is None:
        return "Код не найден или устарел. Сгенерируйте новый в Настройках."
    link.telegram_chat_id = chat_id
    link.telegram_username = username
    link.paired_at = datetime.now(timezone.utc)
    await db.commit()
    user = await db.get(User, link.user_id)
    return f"Готово! Привязка к {user.email if user else '?'} активна. Команды: /help"


async def _handle_help() -> str:
    return (
        "<b>Команды:</b>\n"
        "/tasks — открытые задачи\n"
        "/contacts — последние 10 контактов\n"
        "Просто текст — быстрая заметка-контакт"
    )


async def _handle_tasks(db: AsyncSession, user: User) -> str:
    res = await db.execute(
        select(Task)
        .where(Task.organization_id == user.organization_id)
        .where(Task.status == "open")
        .order_by(Task.due_date.is_(None), Task.due_date.asc())
        .limit(10)
    )
    tasks = list(res.scalars().all())
    if not tasks:
        return "Открытых задач нет 🎉"
    lines = ["<b>Открытые задачи:</b>"]
    for t in tasks:
        due = t.due_date.strftime("%d.%m %H:%M") if t.due_date else "—"
        lines.append(f"• {t.title} (до {due})")
    return "\n".join(lines)


async def _handle_contacts(db: AsyncSession, user: User) -> str:
    res = await db.execute(
        select(Contact)
        .where(Contact.organization_id == user.organization_id)
        .order_by(Contact.created_at.desc())
        .limit(10)
    )
    rows = list(res.scalars().all())
    if not rows:
        return "Контактов пока нет."
    lines = ["<b>Последние 10:</b>"]
    for c in rows:
        meta = " · ".join(filter(None, [c.company, c.position])) or "—"
        lines.append(f"• {c.name or '(без имени)'} — {meta}")
    return "\n".join(lines)


async def _handle_quick_note(db: AsyncSession, user: User, text: str) -> str:
    contact = Contact(
        name=text[:200],
        note=text,
        organization_id=user.organization_id,
        captured_by_id=user.id,
        assignee_id=user.id,
        exhibition_id=user.active_exhibition_id,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return f"Записал заметку #{contact.id}: {contact.name}"


async def _process_message(client: httpx.AsyncClient, token: str, msg: dict) -> None:
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    if not chat_id:
        return
    text: str = msg.get("text") or ""
    username = (msg.get("from") or {}).get("username")

    async with AsyncSessionLocal() as db:
        if text.startswith("/start"):
            args = text[len("/start") :].strip()
            reply = await _handle_start(db, chat_id, username, args)
            await _send(client, token, chat_id, reply)
            return

        user = await _user_for_chat(db, chat_id)
        if user is None:
            await _send(
                client,
                token,
                chat_id,
                "Сначала привяжите аккаунт: /start КОД (получить код в Настройках приложения).",
            )
            return

        if text.startswith("/help"):
            await _send(client, token, chat_id, await _handle_help())
        elif text.startswith("/tasks"):
            await _send(client, token, chat_id, await _handle_tasks(db, user))
        elif text.startswith("/contacts"):
            await _send(client, token, chat_id, await _handle_contacts(db, user))
        elif text.strip():
            reply = await _handle_quick_note(db, user, text.strip())
            await _send(client, token, chat_id, reply)
        else:
            await _send(client, token, chat_id, "Не понял. /help для списка команд.")


async def run_bot() -> None:
    token = get_token()
    if not token:
        log.info("TELEGRAM_BOT_TOKEN not set; bot disabled")
        return
    log.info("starting Telegram bot long-poll")
    last_update_id = 0
    async with httpx.AsyncClient() as client:
        # delete any webhook so getUpdates works
        try:
            await _api(client, token, "deleteWebhook", drop_pending_updates=False)
        except Exception as e:
            log.warning("deleteWebhook failed: %s", e)
        while True:
            try:
                r = await client.post(
                    f"{API_BASE.format(token=token)}/getUpdates",
                    json={"timeout": 25, "offset": last_update_id + 1, "allowed_updates": ["message"]},
                    timeout=60,
                )
                data = r.json()
                if not data.get("ok"):
                    log.warning("getUpdates not ok: %s", data)
                    await asyncio.sleep(5)
                    continue
                for upd in data.get("result", []):
                    last_update_id = max(last_update_id, upd["update_id"])
                    msg = upd.get("message")
                    if msg:
                        try:
                            await _process_message(client, token, msg)
                        except Exception as e:
                            log.exception("process_message failed: %s", e)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.warning("getUpdates loop error: %s", e)
                await asyncio.sleep(5)


_task: asyncio.Task[None] | None = None


def start_in_background() -> None:
    global _task
    if not _enabled():
        log.info("Telegram bot disabled (no TELEGRAM_BOT_TOKEN)")
        return
    if _task and not _task.done():
        return
    _task = asyncio.create_task(run_bot(), name="telegram-bot")


def stop() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        _task = None


def restart() -> None:
    stop()
    start_in_background()
