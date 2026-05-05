from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import ai, schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import Contact, FollowUpAction, ProposalTemplate, User

router = APIRouter(prefix="/api/followups", tags=["followups"])


@router.post("/draft", response_model=schemas.FollowUpOut)
def draft_followup(
    payload: schemas.FollowUpDraftRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = (
        db.query(Contact)
        .filter(Contact.id == payload.contact_id, Contact.company_id == user.company_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Контакт не найден")

    template_body = None
    if payload.template_id:
        t = (
            db.query(ProposalTemplate)
            .filter(
                ProposalTemplate.id == payload.template_id,
                ProposalTemplate.company_id == user.company_id,
            )
            .first()
        )
        if t:
            template_body = t.body

    contact_dict = {
        "name": c.name,
        "role_title": c.role_title,
        "contact_company": c.contact_company,
        "agreements": c.agreements,
        "next_step": c.next_step,
        "summary": c.summary,
    }
    gen = ai.generate_followup(
        kind=payload.kind,
        contact=contact_dict,
        personalization=payload.personalization,
        template_body=template_body,
    )

    fu = FollowUpAction(
        contact_id=c.id,
        kind=payload.kind,
        personalization=payload.personalization,
        subject=gen.get("subject"),
        body=gen.get("body"),
        status="draft",
    )
    db.add(fu)
    db.commit()
    db.refresh(fu)
    return fu


@router.get("/by-contact/{contact_id}", response_model=list[schemas.FollowUpOut])
def list_followups(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = (
        db.query(Contact)
        .filter(Contact.id == contact_id, Contact.company_id == user.company_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    return (
        db.query(FollowUpAction)
        .filter(FollowUpAction.contact_id == contact_id)
        .order_by(FollowUpAction.created_at.desc())
        .all()
    )


@router.patch("/{followup_id}", response_model=schemas.FollowUpOut)
def update_followup(
    followup_id: str,
    payload: schemas.FollowUpUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fu = db.query(FollowUpAction).filter(FollowUpAction.id == followup_id).first()
    if not fu:
        raise HTTPException(status_code=404, detail="Не найдено")
    c = db.query(Contact).filter(Contact.id == fu.contact_id).first()
    if not c or c.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Не найдено")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(fu, k, v)
    if fu.status == "sent" and not fu.sent_at:
        fu.sent_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(fu)
    return fu


# ---------- Templates ----------
@router.get("/templates", response_model=list[schemas.ProposalTemplateOut])
def list_templates(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return (
        db.query(ProposalTemplate)
        .filter(ProposalTemplate.company_id == user.company_id)
        .order_by(ProposalTemplate.kind, ProposalTemplate.name)
        .all()
    )


@router.post("/templates", response_model=schemas.ProposalTemplateOut)
def create_template(
    payload: schemas.ProposalTemplateCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.is_default:
        db.query(ProposalTemplate).filter(
            ProposalTemplate.company_id == user.company_id,
            ProposalTemplate.kind == payload.kind,
        ).update({"is_default": False})
    t = ProposalTemplate(
        company_id=user.company_id,
        kind=payload.kind,
        name=payload.name,
        body=payload.body,
        is_default=payload.is_default,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = (
        db.query(ProposalTemplate)
        .filter(
            ProposalTemplate.id == template_id,
            ProposalTemplate.company_id == user.company_id,
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    db.delete(t)
    db.commit()
    return {"ok": True}
