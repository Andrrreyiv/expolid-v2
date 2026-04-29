from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import PushSubscription, User
from app.push import VAPID_PUBLIC_KEY
from app.schemas import Message

router = APIRouter(prefix="/api/push", tags=["push"])


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeIn(BaseModel):
    endpoint: str
    keys: SubscriptionKeys


class PublicKeyOut(BaseModel):
    public_key: str


@router.get("/public-key", response_model=PublicKeyOut)
async def get_public_key() -> PublicKeyOut:
    return PublicKeyOut(public_key=VAPID_PUBLIC_KEY)


@router.post("/subscribe", response_model=Message)
async def subscribe(
    payload: SubscribeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    existing = (
        await db.execute(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    ).scalar_one_or_none()
    if existing is not None:
        existing.user_id = user.id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        await db.commit()
        return Message(detail="updated")
    sub = PushSubscription(
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_id=user.id,
    )
    db.add(sub)
    await db.commit()
    return Message(detail="ok")


@router.post("/unsubscribe", response_model=Message)
async def unsubscribe(
    payload: SubscribeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    res = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    sub = res.scalar_one_or_none()
    if sub is not None:
        await db.delete(sub)
        await db.commit()
    return Message(detail="ok")
