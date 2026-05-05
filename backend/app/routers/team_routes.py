from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user, hash_password
from ..db import get_db
from ..models import User

router = APIRouter(prefix="/api/team", tags=["team"])


@router.get("/members", response_model=list[schemas.TeamMemberOut])
def list_members(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return (
        db.query(User)
        .filter(User.company_id == user.company_id)
        .order_by(User.created_at)
        .all()
    )


@router.post("/members", response_model=schemas.TeamMemberOut)
def invite_member(
    payload: schemas.TeamMemberInvite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email уже занят")
    new_user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        name=payload.name,
        role=payload.role if payload.role in ("owner", "manager", "staff") else "staff",
        company_id=user.company_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.delete("/members/{user_id}")
def remove_member(
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить себя")
    target = (
        db.query(User)
        .filter(User.id == user_id, User.company_id == user.company_id)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Не найден")
    target.is_active = False
    db.commit()
    return {"ok": True}
