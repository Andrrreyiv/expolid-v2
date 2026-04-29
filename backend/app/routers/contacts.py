from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.events import publish
from app.models import Contact, User
from app.push import notify_team
from app.schemas import ContactIn, ContactOut, ContactUpdate, Message

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    exhibition_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Contact]:
    stmt = select(Contact).where(Contact.organization_id == user.organization_id)
    if exhibition_id is not None:
        stmt = stmt.where(Contact.exhibition_id == exhibition_id)
    stmt = stmt.order_by(Contact.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=ContactOut)
async def create_contact(
    payload: ContactIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Contact:
    data = payload.model_dump()
    if data.get("exhibition_id") is None and user.active_exhibition_id is not None:
        data["exhibition_id"] = user.active_exhibition_id
    contact = Contact(
        **data,
        organization_id=user.organization_id,
        captured_by_id=user.id,
        assignee_id=user.id,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    publish(
        user.organization_id,
        "contact.created",
        {"id": contact.id, "name": contact.name, "by": user.name},
    )
    await notify_team(
        db,
        organization_id=user.organization_id,
        exclude_user_id=user.id,
        title="Новый контакт",
        body=f"{user.name} записал(а): {contact.name or contact.company or 'контакт'}",
        url=f"/contacts/{contact.id}",
    )
    return contact


@router.get("/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Contact:
    c = await db.get(Contact, contact_id)
    if c is None or c.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    return c


@router.patch("/{contact_id}", response_model=ContactOut)
async def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Contact:
    c = await db.get(Contact, contact_id)
    if c is None or c.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(c, field, value)
    await db.commit()
    await db.refresh(c)
    publish(
        user.organization_id,
        "contact.updated",
        {"id": c.id, "name": c.name, "status": c.status},
    )
    return c


@router.delete("/{contact_id}", response_model=Message)
async def delete_contact(
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    c = await db.get(Contact, contact_id)
    if c is None or c.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.delete(c)
    await db.commit()
    publish(user.organization_id, "contact.deleted", {"id": contact_id})
    return Message(detail="ok")
