"""Routing rules CRUD (P1.7)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import RoutingRule, User

router = APIRouter(prefix="/api/routing-rules", tags=["routing"])


def _require_owner_or_manager(user: User) -> None:
    if user.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Только owner или manager")


@router.get("", response_model=list[schemas.RoutingRuleOut])
def list_rules(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(RoutingRule)
        .filter(RoutingRule.company_id == user.company_id)
        .order_by(RoutingRule.priority.desc(), RoutingRule.created_at.asc())
        .all()
    )


@router.post("", response_model=schemas.RoutingRuleOut)
def create_rule(
    payload: schemas.RoutingRuleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_owner_or_manager(user)
    if payload.action_type not in ("assign", "round_robin", "tag"):
        raise HTTPException(status_code=400, detail="action_type: assign|round_robin|tag")
    r = RoutingRule(
        company_id=user.company_id,
        name=payload.name,
        priority=payload.priority,
        conditions=payload.conditions,
        action_type=payload.action_type,
        action_data=payload.action_data,
        is_active=payload.is_active,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.patch("/{rule_id}", response_model=schemas.RoutingRuleOut)
def update_rule(
    rule_id: str,
    payload: schemas.RoutingRuleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_owner_or_manager(user)
    r = (
        db.query(RoutingRule)
        .filter(RoutingRule.id == rule_id, RoutingRule.company_id == user.company_id)
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    data = payload.model_dump(exclude_unset=True)
    if data.get("action_type") and data["action_type"] not in ("assign", "round_robin", "tag"):
        raise HTTPException(status_code=400, detail="action_type: assign|round_robin|tag")
    for k, v in data.items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


@router.delete("/{rule_id}")
def delete_rule(
    rule_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_owner_or_manager(user)
    r = (
        db.query(RoutingRule)
        .filter(RoutingRule.id == rule_id, RoutingRule.company_id == user.company_id)
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    db.delete(r)
    db.commit()
    return {"ok": True}
