"""Шаблоны анкет квалификации лидов (P0.1) + helper-расчёт балла."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import QualificationTemplate, User

router = APIRouter(prefix="/api/qualification-templates", tags=["qualification"])


def _require_owner_or_manager(user: User) -> None:
    if user.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Только owner или manager")


@router.get("", response_model=list[schemas.QualificationTemplateOut])
def list_templates(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(QualificationTemplate)
        .filter(QualificationTemplate.company_id == user.company_id)
        .order_by(QualificationTemplate.is_default.desc(), QualificationTemplate.created_at.desc())
        .all()
    )


@router.post("", response_model=schemas.QualificationTemplateOut)
def create_template(
    payload: schemas.QualificationTemplateCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_owner_or_manager(user)
    if payload.is_default:
        db.query(QualificationTemplate).filter(
            QualificationTemplate.company_id == user.company_id,
            QualificationTemplate.is_default == True,  # noqa: E712
        ).update({"is_default": False})
    t = QualificationTemplate(
        company_id=user.company_id,
        name=payload.name,
        questions=[q.model_dump() for q in payload.questions],
        is_default=payload.is_default,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.patch("/{template_id}", response_model=schemas.QualificationTemplateOut)
def update_template(
    template_id: str,
    payload: schemas.QualificationTemplateUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_owner_or_manager(user)
    t = (
        db.query(QualificationTemplate)
        .filter(
            QualificationTemplate.id == template_id,
            QualificationTemplate.company_id == user.company_id,
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_default"):
        db.query(QualificationTemplate).filter(
            QualificationTemplate.company_id == user.company_id,
            QualificationTemplate.is_default == True,  # noqa: E712
            QualificationTemplate.id != template_id,
        ).update({"is_default": False})
    if "questions" in data and data["questions"] is not None:
        # Объекты Pydantic уже превратились в dict в model_dump
        data["questions"] = data["questions"]
    for k, v in data.items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{template_id}")
def delete_template(
    template_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_owner_or_manager(user)
    t = (
        db.query(QualificationTemplate)
        .filter(
            QualificationTemplate.id == template_id,
            QualificationTemplate.company_id == user.company_id,
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    db.delete(t)
    db.commit()
    return {"ok": True}


def compute_qualification_score(
    template: Optional[QualificationTemplate],
    answers: Optional[dict[str, Any]],
) -> tuple[Optional[int], Optional[str]]:
    """Возвращает (score 0-100, reason). Score складывается из option.score * weight,
    нормализуется на максимум возможных баллов."""
    if not template or not answers:
        return None, None
    total = 0.0
    max_total = 0.0
    reasons: list[str] = []
    questions = template.questions or []
    for q in questions:
        qid = q.get("id")
        weight = float(q.get("score_weight") or 1.0)
        qtype = q.get("type")
        options = q.get("options") or []
        # Maximum possible for this question:
        #   - single/bool/text/number: only one option can be picked → max(scores)
        #   - multi: every option can be selected at once → sum(scores)
        opt_scores = [int(o.get("score") or 0) for o in options]
        if opt_scores:
            if qtype == "multi":
                max_total += sum(opt_scores) * weight
            else:
                max_total += max(opt_scores) * weight
        ans = answers.get(qid)
        if ans is None:
            continue
        if q.get("type") == "single":
            for o in options:
                if o.get("value") == ans:
                    s = int(o.get("score") or 0) * weight
                    total += s
                    if s > 0:
                        reasons.append(f"{q.get('text')} → {o.get('label')} (+{int(s)})")
                    break
        elif q.get("type") == "multi":
            for o in options:
                if o.get("value") in (ans if isinstance(ans, list) else [ans]):
                    s = int(o.get("score") or 0) * weight
                    total += s
                    if s > 0:
                        reasons.append(f"{q.get('text')} → {o.get('label')} (+{int(s)})")
        elif q.get("type") == "rating":
            try:
                rating = int(ans)
                # 1..5 → 1..5 score, weight scales it
                s = rating * weight
                total += s
                # max for rating is 5 by convention
                if not opt_scores:
                    max_total += 5 * weight
                if s > 0:
                    reasons.append(f"{q.get('text')} → {rating}/5 (+{int(s)})")
            except (ValueError, TypeError):
                pass
    if max_total <= 0:
        return None, None
    score_pct = int(round((total / max_total) * 100))
    score_pct = max(0, min(100, score_pct))
    reason = "; ".join(reasons[:5]) if reasons else None
    return score_pct, reason
