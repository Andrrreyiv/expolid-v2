"""Web Push (VAPID) helpers.

VAPID keys are loaded from env (VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY) or, if
absent, generated once and persisted to the data directory so they remain
stable across restarts. `send_to_user` and `notify_team` are no-ops when no
subscriptions exist or pywebpush fails (we silently drop dead subscriptions).
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from pathlib import Path
from typing import Iterable

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PushSubscription, User

log = logging.getLogger(__name__)


def _vapid_dir() -> Path:
    base = Path("/data") if os.path.isdir("/data") else Path("./uploads")
    base.mkdir(parents=True, exist_ok=True)
    return base


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def _generate_vapid() -> dict[str, str]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_numbers = private_key.public_key().public_numbers()
    # Uncompressed point: 0x04 || X (32) || Y (32)
    x = public_numbers.x.to_bytes(32, "big")
    y = public_numbers.y.to_bytes(32, "big")
    raw_pub = b"\x04" + x + y
    return {
        "private_pem": private_pem,
        "public_b64": _b64url(raw_pub),
    }


def _load_vapid() -> dict[str, str]:
    env_priv = os.getenv("VAPID_PRIVATE_PEM")
    env_pub = os.getenv("VAPID_PUBLIC_KEY")
    if env_priv and env_pub:
        return {"private_pem": env_priv, "public_b64": env_pub}
    path = _vapid_dir() / "vapid.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    keys = _generate_vapid()
    try:
        path.write_text(json.dumps(keys))
    except Exception as e:
        log.warning("failed to persist VAPID keys: %s", e)
    return keys


_VAPID = _load_vapid()
VAPID_PUBLIC_KEY = _VAPID["public_b64"]
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:expolid@example.com")


def _send_one(sub: PushSubscription, payload: dict) -> bool:
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=_VAPID["private_pem"],
            vapid_claims={"sub": VAPID_SUBJECT},
        )
        return True
    except WebPushException as e:
        if e.response is not None and e.response.status_code in (404, 410):
            return False  # caller should delete
        log.warning("push failed: %s", e)
        return True  # keep, transient
    except Exception as e:
        log.warning("push exception: %s", e)
        return True


async def _send_to_subs(
    db: AsyncSession,
    subs: Iterable[PushSubscription],
    payload: dict,
) -> None:
    loop = asyncio.get_event_loop()
    dead: list[int] = []
    for sub in subs:
        ok = await loop.run_in_executor(None, _send_one, sub, payload)
        if not ok:
            dead.append(sub.id)
    if dead:
        await db.execute(
            PushSubscription.__table__.delete().where(PushSubscription.id.in_(dead))
        )
        await db.commit()


async def send_to_user(
    db: AsyncSession,
    user_id: int,
    title: str,
    body: str,
    url: str | None = None,
) -> None:
    res = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    subs = list(res.scalars().all())
    if not subs:
        return
    await _send_to_subs(db, subs, {"title": title, "body": body, "url": url or "/"})


async def notify_team(
    db: AsyncSession,
    organization_id: int,
    title: str,
    body: str,
    exclude_user_id: int | None = None,
    url: str | None = None,
) -> None:
    stmt = (
        select(PushSubscription)
        .join(User, User.id == PushSubscription.user_id)
        .where(User.organization_id == organization_id)
    )
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    res = await db.execute(stmt)
    subs = list(res.scalars().all())
    if not subs:
        return
    await _send_to_subs(db, subs, {"title": title, "body": body, "url": url or "/"})
