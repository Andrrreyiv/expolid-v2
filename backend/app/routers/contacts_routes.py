from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import ai, push, schemas, storage
from ..events import bus
from ..auth import get_current_user
from ..db import get_db
from ..models import Contact, ContactMedia, Exhibition, QualificationTemplate, RoutingRule, Task, User
from .qualification_routes import compute_qualification_score
from ..routing import apply_routing_rules

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

    data = payload.model_dump(exclude={"exhibition_id", "consent_given"})
    # Валидируем qualification_template_id (cross-tenant)
    if data.get("qualification_template_id"):
        ok = (
            db.query(QualificationTemplate)
            .filter(
                QualificationTemplate.id == data["qualification_template_id"],
                QualificationTemplate.company_id == user.company_id,
            )
            .first()
        )
        if not ok:
            raise HTTPException(status_code=400, detail="Анкета не из вашей компании")
    # Согласие пишем как timestamp, если consent_given=True
    if payload.consent_given:
        data["consent_given_at"] = datetime.now(timezone.utc)
    c = Contact(
        company_id=user.company_id,
        owner_user_id=user.id,
        exhibition_id=exhibition_id,
        **data,
    )
    # Считаем quiz-score если есть ответы
    if c.qualification_template_id and c.qualification_answers:
        tpl = db.query(QualificationTemplate).filter(
            QualificationTemplate.id == c.qualification_template_id
        ).first()
        qs, qr = compute_qualification_score(tpl, c.qualification_answers)
        if qs is not None:
            # Совмещаем с AI-score: max
            ai_s = c.ai_score or 0
            c.ai_score = max(ai_s, qs)
            extra = f"Анкета: {qr}" if qr else f"Анкета: {qs}/100"
            c.ai_score_reason = (c.ai_score_reason + " | " if c.ai_score_reason else "") + extra
    # Применяем routing rules (P1.7)
    apply_routing_rules(db, c, user)
    db.add(c)
    db.flush()
    if c.next_step:
        _create_task_from_next_step(db, c)
    db.commit()
    db.refresh(c)
    return c


# ---------- Duplicate detection (P0.3) ----------
def _norm_phone(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    return "".join(ch for ch in p if ch.isdigit())[-10:] or None


def _find_duplicates(
    db: Session,
    company_id: str,
    name: Optional[str],
    contact_company: Optional[str],
    email: Optional[str],
    phone: Optional[str],
    exclude_id: Optional[str] = None,
) -> list[tuple[Contact, list[str], int]]:
    """Возвращает список (contact, reasons, score) — кандидатов в дубли."""
    if not (email or phone or name):
        return []
    q = db.query(Contact).filter(
        Contact.company_id == company_id,
        Contact.erased_at.is_(None),
    )
    if exclude_id:
        q = q.filter(Contact.id != exclude_id)
    candidates: list[tuple[Contact, list[str], int]] = []
    norm_phone = _norm_phone(phone)
    email_lc = (email or "").strip().lower() or None
    name_lc = (name or "").strip().lower() or None
    company_lc = (contact_company or "").strip().lower() or None
    for c in q.all():
        reasons: list[str] = []
        score = 0
        if email_lc and c.email and c.email.strip().lower() == email_lc:
            reasons.append("email")
            score += 70
        if norm_phone and _norm_phone(c.phone) == norm_phone:
            reasons.append("phone")
            score += 60
        if name_lc and company_lc and c.name and c.contact_company:
            if c.name.strip().lower() == name_lc and c.contact_company.strip().lower() == company_lc:
                reasons.append("name+company")
                score += 50
        if reasons:
            candidates.append((c, reasons, min(score, 100)))
    candidates.sort(key=lambda x: x[2], reverse=True)
    return candidates[:10]


@router.get("/duplicates/find", response_model=list[schemas.DuplicateCandidate])
def find_duplicates(
    name: Optional[str] = None,
    contact_company: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    exclude_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    candidates = _find_duplicates(
        db, user.company_id, name, contact_company, email, phone, exclude_id
    )
    return [
        schemas.DuplicateCandidate(
            id=c.id, name=c.name, contact_company=c.contact_company,
            email=c.email, phone=c.phone, match_reasons=reasons, score=score,
            created_at=c.created_at,
        )
        for c, reasons, score in candidates
    ]


@router.post("/merge", response_model=schemas.ContactOut)
def merge_contacts(
    payload: schemas.MergeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    primary = db.query(Contact).filter(Contact.id == payload.primary_id).first()
    if not primary or primary.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Основной контакт не найден")
    secondaries = (
        db.query(Contact)
        .filter(Contact.id.in_(payload.secondary_ids), Contact.company_id == user.company_id)
        .all()
    )
    if len(secondaries) != len(payload.secondary_ids):
        raise HTTPException(status_code=400, detail="Не все вторичные контакты найдены в компании")
    # Переносим связи: media, follow_ups, tasks
    from ..models import FollowUpAction
    for sec in secondaries:
        if sec.id == primary.id:
            continue
        # Заполняем primary тем что есть в secondary, если у primary поле пустое
        for fld in ("phone", "email", "website", "telegram", "whatsapp", "linkedin",
                    "contact_company", "role_title", "summary", "agreements", "next_step"):
            if not getattr(primary, fld) and getattr(sec, fld):
                setattr(primary, fld, getattr(sec, fld))
        db.query(ContactMedia).filter(ContactMedia.contact_id == sec.id).update(
            {"contact_id": primary.id}
        )
        db.query(FollowUpAction).filter(FollowUpAction.contact_id == sec.id).update(
            {"contact_id": primary.id}
        )
        db.query(Task).filter(Task.contact_id == sec.id).update({"contact_id": primary.id})
        db.delete(sec)
    db.commit()
    db.refresh(primary)
    return primary


# ---------- GDPR / 152-FZ erase (P0.4) ----------
@router.post("/{contact_id}/erase")
def erase_contact(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Удаление персональных данных по запросу субъекта (152-ФЗ ст.21, GDPR Art.17).
    Сохраняем строку в БД (для аудита), но забиваем PII стопками "[erased]"."""
    if user.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Только owner/manager")
    c = db.query(Contact).filter(Contact.id == contact_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    _ensure_visible(c, user)
    c.name = "[erased]"
    c.contact_company = None
    c.role_title = None
    c.phone = None
    c.email = None
    c.website = None
    c.telegram = None
    c.whatsapp = None
    c.linkedin = None
    c.summary = None
    c.agreements = None
    c.next_step = None
    c.notes_raw = None
    c.voice_transcript = None
    c.qualification_answers = None
    c.enrichment_data = None
    c.erased_at = datetime.now(timezone.utc)
    # Удаляем все media с диска
    for m in db.query(ContactMedia).filter(ContactMedia.contact_id == c.id).all():
        try:
            storage.delete_upload(m.file_path)
        except Exception:  # noqa: BLE001
            pass
        db.delete(m)
    db.commit()
    return {"ok": True, "erased_at": c.erased_at.isoformat()}


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
    # Валидируем FK, чтобы нельзя было привязать контакт к чужой компании
    if "assigned_user_id" in data and data["assigned_user_id"]:
        ok = (
            db.query(User)
            .filter(User.id == data["assigned_user_id"], User.company_id == user.company_id)
            .first()
        )
        if not ok:
            raise HTTPException(status_code=400, detail="Менеджер не из вашей компании")
    if "exhibition_id" in data and data["exhibition_id"]:
        ok = (
            db.query(Exhibition)
            .filter(
                Exhibition.id == data["exhibition_id"],
                Exhibition.company_id == user.company_id,
            )
            .first()
        )
        if not ok:
            raise HTTPException(status_code=400, detail="Выставка не из вашей компании")
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
def capture_contact(
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
    qualification_template_id: Optional[str] = Form(None),
    qualification_answers_json: Optional[str] = Form(None),
    consent_given: bool = Form(False),
    consent_text_version: Optional[str] = Form(None),
    consent_source: Optional[str] = Form(None),
    capture_source: Optional[str] = Form(None),
    badge_id: Optional[str] = Form(None),
    card_image: Optional[UploadFile] = File(None),
    person_image: Optional[UploadFile] = File(None),
    voice: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (card_image or voice or notes_text or capture_source == "badge"):
        raise HTTPException(
            status_code=400, detail="Нужно хотя бы одно: фото визитки, голос или заметка"
        )

    # Парсим qualification answers (приходят как JSON-строка multipart)
    quiz_answers: Optional[dict] = None
    if qualification_answers_json:
        import json as _json
        try:
            quiz_answers = _json.loads(qualification_answers_json)
            if not isinstance(quiz_answers, dict):
                quiz_answers = None
        except _json.JSONDecodeError:
            quiz_answers = None

    # Валидируем qualification_template_id (cross-tenant)
    if qualification_template_id:
        ok = (
            db.query(QualificationTemplate)
            .filter(
                QualificationTemplate.id == qualification_template_id,
                QualificationTemplate.company_id == user.company_id,
            )
            .first()
        )
        if not ok:
            raise HTTPException(status_code=400, detail="Анкета не из вашей компании")

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
        qualification_template_id=qualification_template_id,
        qualification_answers=quiz_answers,
        consent_given_at=datetime.now(timezone.utc) if consent_given else None,
        consent_text_version=consent_text_version,
        consent_source=consent_source,
        capture_source=capture_source,
        badge_id=badge_id,
    )
    # Quiz-score
    if c.qualification_template_id and c.qualification_answers:
        tpl = db.query(QualificationTemplate).filter(
            QualificationTemplate.id == c.qualification_template_id
        ).first()
        qs, qr = compute_qualification_score(tpl, c.qualification_answers)
        if qs is not None:
            ai_s = c.ai_score or 0
            c.ai_score = max(ai_s, qs)
            extra = f"Анкета: {qr}" if qr else f"Анкета: {qs}/100"
            c.ai_score_reason = (c.ai_score_reason + " | " if c.ai_score_reason else "") + extra
    # Routing rules
    apply_routing_rules(db, c, user)
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
def upload_media(
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
