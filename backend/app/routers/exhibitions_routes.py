from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import Exhibition, User

router = APIRouter(prefix="/api/exhibitions", tags=["exhibitions"])


@router.get("", response_model=list[schemas.ExhibitionOut])
def list_exhibitions(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    items = (
        db.query(Exhibition)
        .filter(Exhibition.company_id == user.company_id)
        .order_by(Exhibition.is_active.desc(), Exhibition.start_date.desc().nullslast())
        .all()
    )
    return items


@router.post("", response_model=schemas.ExhibitionOut)
def create_exhibition(
    payload: schemas.ExhibitionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    e = Exhibition(
        company_id=user.company_id,
        name=payload.name,
        city=payload.city,
        venue=payload.venue,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )
    has_active = (
        db.query(Exhibition)
        .filter(Exhibition.company_id == user.company_id, Exhibition.is_active == True)
        .first()
    )
    if not has_active:
        e.is_active = True
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.patch("/{exhibition_id}", response_model=schemas.ExhibitionOut)
def update_exhibition(
    exhibition_id: str,
    payload: schemas.ExhibitionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    e = (
        db.query(Exhibition)
        .filter(
            Exhibition.id == exhibition_id, Exhibition.company_id == user.company_id
        )
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="Выставка не найдена")
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_active"):
        db.query(Exhibition).filter(
            Exhibition.company_id == user.company_id,
            Exhibition.id != exhibition_id,
        ).update({"is_active": False})
    for k, v in data.items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


@router.post("/{exhibition_id}/activate", response_model=schemas.ExhibitionOut)
def activate_exhibition(
    exhibition_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    e = (
        db.query(Exhibition)
        .filter(
            Exhibition.id == exhibition_id, Exhibition.company_id == user.company_id
        )
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="Выставка не найдена")
    db.query(Exhibition).filter(
        Exhibition.company_id == user.company_id, Exhibition.id != exhibition_id
    ).update({"is_active": False})
    e.is_active = True
    db.commit()
    db.refresh(e)
    return e


@router.delete("/{exhibition_id}")
def delete_exhibition(
    exhibition_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    e = (
        db.query(Exhibition)
        .filter(
            Exhibition.id == exhibition_id, Exhibition.company_id == user.company_id
        )
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="Выставка не найдена")
    db.delete(e)
    db.commit()
    return {"ok": True}
