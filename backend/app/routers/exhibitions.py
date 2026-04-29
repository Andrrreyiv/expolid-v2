from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Exhibition, User
from app.schemas import ExhibitionIn, ExhibitionOut, ExhibitionUpdate, Message

router = APIRouter(prefix="/api/exhibitions", tags=["exhibitions"])


@router.get("", response_model=list[ExhibitionOut])
async def list_exhibitions(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Exhibition]:
    res = await db.execute(
        select(Exhibition)
        .where(Exhibition.organization_id == user.organization_id)
        .order_by(Exhibition.created_at.desc())
    )
    return list(res.scalars().all())


@router.post("", response_model=ExhibitionOut)
async def create_exhibition(
    payload: ExhibitionIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Exhibition:
    ex = Exhibition(
        name=payload.name,
        location=payload.location,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        organization_id=user.organization_id,
    )
    db.add(ex)
    await db.commit()
    await db.refresh(ex)

    # Auto-activate first exhibition
    if user.active_exhibition_id is None:
        user.active_exhibition_id = ex.id
        await db.commit()

    return ex


@router.patch("/{exhibition_id}", response_model=ExhibitionOut)
async def update_exhibition(
    exhibition_id: int,
    payload: ExhibitionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Exhibition:
    ex = await db.get(Exhibition, exhibition_id)
    if ex is None or ex.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Exhibition not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ex, field, value)
    await db.commit()
    await db.refresh(ex)
    return ex


@router.delete("/{exhibition_id}", response_model=Message)
async def delete_exhibition(
    exhibition_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    ex = await db.get(Exhibition, exhibition_id)
    if ex is None or ex.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Exhibition not found")
    await db.delete(ex)
    await db.commit()
    return Message(detail="ok")


@router.post("/{exhibition_id}/activate", response_model=Message)
async def activate_exhibition(
    exhibition_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    ex = await db.get(Exhibition, exhibition_id)
    if ex is None or ex.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Exhibition not found")
    user.active_exhibition_id = ex.id
    await db.commit()
    return Message(detail="activated")


@router.post("/deactivate", response_model=Message)
async def deactivate_exhibition(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    user.active_exhibition_id = None
    await db.commit()
    return Message(detail="deactivated")
