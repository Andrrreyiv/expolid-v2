import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import telegram_bot
from app.database import get_db
from app.deps import get_current_user
from app.models import ROLE_OWNER, TelegramLink, User
from app.schemas import Message

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


class TelegramStatus(BaseModel):
    enabled: bool
    bot_username: str | None
    paired: bool
    chat_id: int | None
    code: str | None


def _bot_enabled() -> bool:
    return bool(telegram_bot.get_token())


@router.get("/status", response_model=TelegramStatus)
async def status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TelegramStatus:
    res = await db.execute(select(TelegramLink).where(TelegramLink.user_id == user.id))
    link = res.scalar_one_or_none()
    paired = bool(link and link.paired_at is not None)
    return TelegramStatus(
        enabled=_bot_enabled(),
        bot_username=telegram_bot.get_username(),
        paired=paired,
        chat_id=link.telegram_chat_id if link else None,
        code=link.pairing_code if (link and not paired) else None,
    )


@router.post("/pair", response_model=TelegramStatus)
async def request_pair_code(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TelegramStatus:
    res = await db.execute(select(TelegramLink).where(TelegramLink.user_id == user.id))
    link = res.scalar_one_or_none()
    code = secrets.token_hex(3).upper()  # 6-char hex code
    if link is None:
        link = TelegramLink(user_id=user.id, pairing_code=code)
        db.add(link)
    else:
        link.pairing_code = code
        link.paired_at = None
        link.telegram_chat_id = None
    await db.commit()
    await db.refresh(link)
    return TelegramStatus(
        enabled=_bot_enabled(),
        bot_username=telegram_bot.get_username(),
        paired=False,
        chat_id=None,
        code=link.pairing_code,
    )


@router.delete("/pair", response_model=Message)
async def unpair(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    res = await db.execute(select(TelegramLink).where(TelegramLink.user_id == user.id))
    link = res.scalar_one_or_none()
    if link is not None:
        await db.delete(link)
        await db.commit()
    return Message(detail="ok")


class ConfigureIn(BaseModel):
    token: str
    bot_username: str | None = None


@router.post("/configure", response_model=Message)
async def configure_bot(
    payload: ConfigureIn,
    user: User = Depends(get_current_user),
) -> Message:
    """Owner-only: store Telegram bot token on the persistent volume and (re)start the bot.

    Allows enabling the bot at runtime without redeploying with the secret baked in.
    """
    if user.role != ROLE_OWNER:
        raise HTTPException(status_code=403, detail="Only owner can configure the bot")
    telegram_bot.write_runtime_secret("TELEGRAM_BOT_TOKEN", payload.token.strip())
    if payload.bot_username:
        telegram_bot.write_runtime_secret("TELEGRAM_BOT_USERNAME", payload.bot_username.strip())
    telegram_bot.restart()
    return Message(detail="ok")
