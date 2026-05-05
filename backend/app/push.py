"""Web Push helper using pywebpush."""
from __future__ import annotations

import base64
import json
import logging
from typing import Any

from pywebpush import WebPushException, webpush
from sqlalchemy.orm import Session

from .config import get_settings
from .models import PushSubscription

logger = logging.getLogger(__name__)


def _vapid_private_pem() -> str:
    settings = get_settings()
    return base64.b64decode(settings.vapid_private_pem_b64).decode()


def send_to_user(db: Session, user_id: str, title: str, body: str, url: str = "/") -> int:
    settings = get_settings()
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    return _send(db, subs, title, body, url)


def send_to_company(
    db: Session, company_id: str, title: str, body: str, url: str = "/", exclude_user_id: str | None = None
) -> int:
    q = db.query(PushSubscription).filter(PushSubscription.company_id == company_id)
    if exclude_user_id:
        q = q.filter(PushSubscription.user_id != exclude_user_id)
    return _send(db, q.all(), title, body, url)


def _send(db: Session, subs: list[PushSubscription], title: str, body: str, url: str) -> int:
    settings = get_settings()
    payload = json.dumps({"title": title, "body": body, "data": {"url": url}}, ensure_ascii=False)
    sent = 0
    for s in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": s.endpoint,
                    "keys": {"p256dh": s.p256dh, "auth": s.auth},
                },
                data=payload,
                vapid_private_key=_vapid_private_pem(),
                vapid_claims={"sub": settings.vapid_subject},
            )
            sent += 1
        except WebPushException as e:
            # 404/410 => subscription is gone; remove it.
            status = getattr(e.response, "status_code", None) if e.response is not None else None
            if status in (404, 410):
                db.delete(s)
            logger.warning("webpush failed: %s status=%s", e, status)
        except Exception as e:  # noqa: BLE001
            logger.warning("webpush unexpected: %s", e)
    db.commit()
    return sent


def public_key() -> str:
    return get_settings().vapid_public_key
