from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import ai, push, schemas, storage
from ..events import bus
from ..auth import get_current_user
from ..db import get_db
from ..models import Contact, ContactMedia, Exhibition, Task, User

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _ensure_visible(contact: Contact, user: User):
    if contact.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Контакт не найден")


@router.get("", response_model=list[schemas.ContactOut])
def list_contacts(
    q: Optional[str] = None,
    exhibition_id: Optional[str] = None,
    status: Optional[str] = None,
    contact_type: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Contact).filter(Contact.company_id == user.company_id)
    if exhibition_id:
        query = query.filter(Contact.exhibition_id == exhibition_id)
    if status:
        query = query.filter(Contact.status == status)
    if contact_type:
        query = query.filter(Contact.contact_type == contact_type)
    if q:
        s = f"%{q}%"
        query = query.filter(
            or_(
                Contact.name.ilike(s),
                Contact.contact_company.ilike(s),
                Contact.phone.ilike(s),
                Contact.email.ilike(s),
            )
        )
    return query.order_by(Contact.created_at.desc()).all()


@router.get("/{contact_id}", response_model=schemas.ContactOut)
def get_contact(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Contact).filter(Contact.id == contact_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    _ensure_visible(c, user)
    return c


@router.post("", response_model=schemas.ContactOut)
def create_contact(
    payload: schemas.ContactCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exhibition_id = payload.exhibition_id
    if not exhibition_id:
        active = (
            db.query(Exhibition)
            .filter(
                Exhibition.company_id == user.company_id,
                Exhibition.is_active == True,
            )
            .first()
        )
        exhibition_id = active.id if active else None
    c = Contact(
        company_id=user.company_id,
        owner_user_id=user.id,
        exhibition_id=exhibition_id,
        **payload.model_dump(exclude={"exhibition_id"}),
    )
    db.add(c)
    db.flush()
    if c.next_step:
        _create_task_from_next_step(db, c)
    db.commit()
    db.refresh(c)
    return c


@router.patch("/{contact_id}", response_model=schemas.ContactOut)
def update_contact(
    contact_id: str,
    payload: schemas.ContactUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Contact).filter(Contact.id == contact_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    _ensure_visible(c, user)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Contact).filter(Contact.id == contact_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    _ensure_visible(c, user)
    db.delete(c)
    db.commit()
    return {"ok": True}


def _create_task_from_next_step(db: Session, contact: Contact):
    due = contact.reminder_at or (datetime.now(timezone.utc) + timedelta(days=3))
    task = Task(
        company_id=contact.company_id,
        contact_id=contact.id,
        assignee_user_id=contact.assigned_user_id or contact.owner_user_id,
        title=contact.next_step or "Связаться",
        due_date=due,
    )
    db.add(task)


# ----- Media upload + AI processing -----
@router.post("/capture", response_model=schemas.ContactOut)
async def capture_contact(
    exhibition_id: Optional[str] = Form(None),
    notes_text: Optional[str] = Form(None),
    talked_to_card_owner: bool = Form(True),
    talked_to_name: Optional[str] = Form(None),
    talked_to_role: Optional[str] = Form(None),
    pavilion: Optional[str] = Form(None),
    stand: Optional[str] = Form(None),
    prefill_name: Optional[str] = Form(None),
    prefill_phone: Optional[str] = Form(None),
    prefill_email: Optional[str] = Form(None),
    prefill_company: Optional[str] = Form(None),
    prefill_role: Optional[str] = Form(None),
    prefill_website: Optional[str] = Form(None),
    prefill_telegram: Optional[str] = Form(None),
    contact_type: str = Form("client"),
    status: str = Form("warm"),
    card_image: Optional[UploadFile] = File(None),
    person_image: Optional[UploadFile] = File(None),
    voice: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (card_image or voice or notes_text):
        raise HTTPException(
            status_code=400, detail="Нужно хотя бы одно: фото визитки, голос или заметка"
        )

    if not exhibition_id:
        active = (
            db.query(Exhibition)
            .filter(
                Exhibition.company_id == user.company_id,
                Exhibition.is_active == True,
            )
            .first()
        )
        exhibition_id = active.id if active else None

    card_path = None
    person_path = None
    voice_path = None
    if card_image:
        rel, abs_path = storage.save_upload(card_image.file, card_image.filename)
        card_path = (rel, abs_path, card_image.content_type)
    if person_image:
        rel, abs_path = storage.save_upload(person_image.file, person_image.filename)
        person_path = (rel, abs_path, person_image.content_type)
    if voice:
        rel, abs_path = storage.save_upload(voice.file, voice.filename)
        voice_path = (rel, abs_path, voice.content_type)

    # AI: OCR card
    ocr_data = {}
    if card_path:
        ocr_data = ai.ocr_business_card(card_path[1]) or {}

    # AI: transcribe voice
    transcript = None
    if voice_path:
        transcript = ai.transcribe_audio(voice_path[1])

    # AI: summarize
    summary = ai.summarize_conversation(
        voice_transcript=transcript,
        text_notes=notes_text,
        contact_company=ocr_data.get("contact_company"),
    )

    reminder_at = None
    days = summary.get("reminder_in_days") if summary else None
    if isinstance(days, int) and 0 < days < 365:
        reminder_at = datetime.now(timezone.utc) + timedelta(days=days)

    # Prefill (от vCard QR / клиентских подсказок) имеет приоритет над OCR.
    def pick(prefill: Optional[str], ocr_value: Any) -> Any:
        if prefill:
            return prefill
        return ocr_value

    c = Contact(
        company_id=user.company_id,
        owner_user_id=user.id,
        exhibition_id=exhibition_id,
        name=pick(prefill_name, ocr_data.get("name")) or (talked_to_name if not talked_to_card_owner else "Без имени"),
        contact_company=pick(prefill_company, ocr_data.get("contact_company")),
        role_title=pick(prefill_role, ocr_data.get("role_title")),
        phone=pick(prefill_phone, ocr_data.get("phone")),
        email=pick(prefill_email, ocr_data.get("email")),
        website=pick(prefill_website, ocr_data.get("website")),
        telegram=pick(prefill_telegram, ocr_data.get("telegram")),
        whatsapp=ocr_data.get("whatsapp"),
        linkedin=ocr_data.get("linkedin"),
        contact_type=contact_type,
        status=status,
        summary=summary.get("summary") if summary else None,
        agreements=summary.get("agreements") if summary else None,
        next_step=summary.get("next_step") if summary else None,
        reminder_at=reminder_at,
        voice_transcript=transcript,
        notes_raw=notes_text,
        ai_score=summary.get("ai_score") if summary else None,
        ai_score_reason=summary.get("ai_score_reason") if summary else None,
        talked_to_card_owner=talked_to_card_owner,
        talked_to_name=talked_to_name,
        talked_to_role=talked_to_role,
        pavilion=pavilion,
        stand=stand,
    )
    db.add(c)
    db.flush()

    if card_path:
        db.add(
            ContactMedia(
                contact_id=c.id,
                kind="card",
                file_path=card_path[0],
                mime_type=card_path[2],
            )
        )
    if person_path:
        db.add(
            ContactMedia(
                contact_id=c.id,
                kind="person",
                file_path=person_path[0],
                mime_type=person_path[2],
            )
        )
    if voice_path:
        db.add(
            ContactMedia(
                contact_id=c.id,
                kind="voice",
                file_path=voice_path[0],
                mime_type=voice_path[2],
                transcript=transcript,
            )
        )

    if c.next_step:
        _create_task_from_next_step(db, c)

    db.commit()
    db.refresh(c)
    bus.publish(
        user.company_id,
        "contact.created",
        {
            "id": c.id,
            "name": c.name,
            "company": c.contact_company,
            "status": c.status,
            "ai_score": c.ai_score,
            "by_user_id": user.id,
            "by_user_name": user.name,
        },
    )
    try:
        push.send_to_company(
            db,
            user.company_id,
            f"Новый контакт: {c.name or '—'}",
            f"{user.name or 'Коллега'}: {c.contact_company or 'без компании'} · {c.status}",
            url=f"/contacts/{c.id}",
            exclude_user_id=user.id,
        )
    except Exception:  # noqa: BLE001
        pass
    return c


@router.post("/{contact_id}/media", response_model=schemas.ContactMediaOut)
async def upload_media(
    contact_id: str,
    kind: str = Form("extra"),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Contact).filter(Contact.id == contact_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    _ensure_visible(c, user)
    rel, _ = storage.save_upload(file.file, file.filename)
    m = ContactMedia(contact_id=c.id, kind=kind, file_path=rel, mime_type=file.content_type)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m
