"""Integrations routes (amoCRM)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..integrations import amocrm
from ..models import Contact, User

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class AmocrmTokenIn(BaseModel):
    subdomain: str
    access_token: str
    refresh_token: str | None = None
    expires_in: int | None = None


@router.get("/amocrm/status")
def amocrm_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return amocrm.health(db, user.company_id)


@router.post("/amocrm/connect")
def amocrm_connect(
    body: AmocrmTokenIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может подключать интеграции")
    rec = amocrm.upsert_token(
        db, user.company_id,
        subdomain=body.subdomain,
        access_token=body.access_token,
        refresh_token=body.refresh_token,
        expires_in=body.expires_in,
    )
    return {"ok": True, "id": rec.id, "health": amocrm.health(db, user.company_id)}


@router.post("/amocrm/disconnect")
def amocrm_disconnect(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец")
    return {"ok": amocrm.disable(db, user.company_id)}


@router.post("/amocrm/push/{contact_id}")
def amocrm_push(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Contact).filter(Contact.id == contact_id, Contact.company_id == user.company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    try:
        return amocrm.push_contact(db, user.company_id, c)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
