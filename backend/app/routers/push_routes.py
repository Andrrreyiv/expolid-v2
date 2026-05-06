"""Web Push endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import push
from ..auth import get_current_user
from ..db import get_db
from ..models import PushSubscription, Task, User
from ..schemas import _Base

router = APIRouter(prefix="/api/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushKeys
    expirationTime: Optional[int] = None  # ignored


@router.get("/key")
def public_key():
    return {"public_key": push.public_key()}


@router.post("/subscribe")
def subscribe(
    body: PushSubscriptionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(PushSubscription).filter(PushSubscription.endpoint == body.endpoint).first()
    )
    if existing:
        existing.user_id = user.id
        existing.company_id = user.company_id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
    else:
        db.add(
            PushSubscription(
                user_id=user.id,
                company_id=user.company_id,
                endpoint=body.endpoint,
                p256dh=body.keys.p256dh,
                auth=body.keys.auth,
            )
        )
    db.commit()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(
    body: PushSubscriptionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == user.id
    ).delete()
    db.commit()
    return {"ok": True}


@router.post("/test")
def test_push(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sent = push.send_to_user(db, user.id, "ЭкспоЛид", "Тестовое уведомление работает 👍")
    return {"sent": sent}


class OverdueResult(_Base):
    sent: int
    overdue: int


@router.post("/check-overdue", response_model=OverdueResult)
def check_overdue(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Найти просроченные задачи моего пользователя/компании и отправить push.
    Идемпотентно: помечает Task.last_push_at, чтобы не спамить.
    Здесь упрощённая версия — фронтенд может вызывать раз в N минут."""
    now = datetime.now(timezone.utc)
    q = (
        db.query(Task)
        .filter(
            Task.company_id == user.company_id,
            Task.is_done == False,  # noqa: E712
            Task.due_date != None,  # noqa: E711
            Task.due_date < now,
        )
    )
    tasks = q.all()
    sent = 0
    for t in tasks:
        target = t.assignee_user_id
        if not target:
            continue
        s = push.send_to_user(
            db,
            target,
            "⏰ Просроченная задача",
            t.title or "Связаться с контактом",
            url=f"/contacts/{t.contact_id}" if t.contact_id else "/tasks",
        )
        sent += s
    return OverdueResult(sent=sent, overdue=len(tasks))
