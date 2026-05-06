"""SSE stream of company events."""
from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from ..auth import get_current_user

ALGORITHM = "HS256"
from ..config import get_settings
from ..events import bus
from ..models import User

router = APIRouter(prefix="/api/events", tags=["events"])


def _user_from_token(token: str, db: Session) -> User | None:
    """SSE не пропускает custom headers через EventSource — auth по query token."""
    try:
        data = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
        sub = data.get("sub")
        if not sub:
            return None
        return db.query(User).filter(User.id == sub, User.is_active == True).first()
    except JWTError:
        return None


@router.get("/stream")
async def stream(
    token: Annotated[str, Query(description="JWT access token")],
):
    # Open and close a short-lived DB session just for auth, чтобы не держать
    # коннект к БД на всё время SSE-стрима (часы/дни). Тело генератора в БД не ходит.
    from ..db import SessionLocal

    db = SessionLocal()
    try:
        user = _user_from_token(token, db)
    finally:
        db.close()

    if not user:
        return StreamingResponse(iter([": auth-error\n\n"]), media_type="text/event-stream")

    company_id = user.company_id

    async def gen():
        q = await bus.subscribe(company_id)
        try:
            yield ": connected\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield bus.encode(msg)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            bus.unsubscribe(company_id, q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/whoami")
def whoami(user: User = Depends(get_current_user)):
    return {"user_id": user.id, "company_id": user.company_id, "name": user.name}
