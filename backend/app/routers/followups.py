import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.events import publish
from app.models import Contact, FollowUp, User
from app.schemas import Message

router = APIRouter(prefix="/api/followups", tags=["followups"])


class FollowUpIn(BaseModel):
    contact_id: int
    kind: str
    subject: str | None = None
    body: str
    personalization: str | None = None


class FollowUpOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contact_id: int
    kind: str
    subject: str | None
    body: str
    personalization: str | None
    sent_at: datetime | None
    created_at: datetime


class RenderRequest(BaseModel):
    contact_id: int
    subject: str | None = None
    body: str
    extras: dict[str, str] = Field(default_factory=dict)


class RenderResponse(BaseModel):
    subject: str | None
    body: str
    used_vars: list[str]
    missing_vars: list[str]


_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def _render(text: str, ctx: dict[str, str]) -> tuple[str, list[str], list[str]]:
    used: list[str] = []
    missing: list[str] = []

    def repl(m: re.Match[str]) -> str:
        key = m.group(1)
        if key in ctx and ctx[key] != "":
            used.append(key)
            return ctx[key]
        missing.append(key)
        # leave placeholder visible so the user knows what to fill
        return f"{{{{{key}}}}}"

    rendered = _VAR_RE.sub(repl, text)
    return rendered, used, missing


def _ctx_from_contact(contact: Contact, user: User, extras: dict[str, str]) -> dict[str, str]:
    ctx: dict[str, str] = {
        "name": contact.name or "",
        "company": contact.company or "",
        "position": contact.position or "",
        "email": contact.email or "",
        "phone": contact.phone or "",
        "my_name": user.name,
        "my_email": user.email,
    }
    # extras override base values
    for k, v in (extras or {}).items():
        if v is not None:
            ctx[k] = str(v)
    return ctx


@router.get("", response_model=list[FollowUpOut])
async def list_followups(
    contact_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FollowUp]:
    stmt = select(FollowUp).where(FollowUp.organization_id == user.organization_id)
    if contact_id is not None:
        stmt = stmt.where(FollowUp.contact_id == contact_id)
    stmt = stmt.order_by(FollowUp.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=FollowUpOut)
async def create_followup(
    payload: FollowUpIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowUp:
    contact = await db.get(Contact, payload.contact_id)
    if contact is None or contact.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    fu = FollowUp(
        contact_id=payload.contact_id,
        kind=payload.kind,
        subject=payload.subject,
        body=payload.body,
        personalization=payload.personalization,
        organization_id=user.organization_id,
    )
    db.add(fu)
    await db.commit()
    await db.refresh(fu)
    publish(
        user.organization_id,
        "followup.created",
        {"id": fu.id, "contact_id": fu.contact_id, "kind": fu.kind},
    )
    return fu


@router.post("/{followup_id}/sent", response_model=FollowUpOut)
async def mark_sent(
    followup_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowUp:
    fu = await db.get(FollowUp, followup_id)
    if fu is None or fu.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    fu.sent_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(fu)
    publish(
        user.organization_id,
        "followup.sent",
        {"id": fu.id, "contact_id": fu.contact_id, "kind": fu.kind},
    )
    return fu


@router.delete("/{followup_id}", response_model=Message)
async def delete_followup(
    followup_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    fu = await db.get(FollowUp, followup_id)
    if fu is None or fu.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    await db.delete(fu)
    await db.commit()
    publish(user.organization_id, "followup.deleted", {"id": followup_id})
    return Message(detail="ok")


@router.post("/render", response_model=RenderResponse)
async def render_template(
    payload: RenderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderResponse:
    contact = await db.get(Contact, payload.contact_id)
    if contact is None or contact.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    ctx = _ctx_from_contact(contact, user, payload.extras)
    body, body_used, body_missing = _render(payload.body, ctx)
    if payload.subject:
        subject, sub_used, sub_missing = _render(payload.subject, ctx)
    else:
        subject, sub_used, sub_missing = None, [], []
    return RenderResponse(
        subject=subject,
        body=body,
        used_vars=sorted(set(body_used + sub_used)),
        missing_vars=sorted(set(body_missing + sub_missing)),
    )
