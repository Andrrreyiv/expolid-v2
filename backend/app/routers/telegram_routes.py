"""Telegram bot integration endpoints."""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import User
from ..telegram_bot import issue_link_code

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


@router.get("/status")
def status(user: User = Depends(get_current_user)):
    bot_username = os.getenv("TELEGRAM_BOT_USERNAME", "expolid_bot")
    return {
        "enabled": bool(os.getenv("TELEGRAM_BOT_TOKEN")),
        "linked": bool(user.telegram_chat_id),
        "bot_username": bot_username,
    }


@router.post("/link-code")
def link_code(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = issue_link_code(db, user.id)
    bot_username = os.getenv("TELEGRAM_BOT_USERNAME", "expolid_bot")
    return {
        "code": code,
        "deep_link": f"https://t.me/{bot_username}?start={code}",
        "expires_minutes": 30,
    }


@router.post("/unlink")
def unlink(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.telegram_chat_id = None
    db.commit()
    return {"ok": True}
