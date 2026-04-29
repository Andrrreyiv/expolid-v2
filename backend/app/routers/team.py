import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import Message
from app.security import hash_password

router = APIRouter(prefix="/api/team", tags=["team"])

ROLES = ("owner", "manager", "staff")


class TeamMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    role: str
    is_active: bool


class InviteIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    role: str = "staff"


class InviteOut(TeamMemberOut):
    initial_password: str


class RoleUpdate(BaseModel):
    role: str


def _require(user: User, *, allow: tuple[str, ...] = ("owner", "manager")) -> None:
    if user.role not in allow:
        raise HTTPException(status_code=403, detail="Insufficient role")


@router.get("", response_model=list[TeamMemberOut])
async def list_members(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[User]:
    res = await db.execute(
        select(User).where(User.organization_id == user.organization_id).order_by(User.id.asc())
    )
    return list(res.scalars().all())


@router.post("/invite", response_model=InviteOut)
async def invite_member(
    payload: InviteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InviteOut:
    _require(user, allow=("owner", "manager"))
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {ROLES}")

    existing = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="User with this email already exists")

    initial_password = secrets.token_urlsafe(8)
    new_user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(initial_password),
        role=payload.role,
        is_active=True,
        organization_id=user.organization_id,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return InviteOut(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name,
        role=new_user.role,
        is_active=new_user.is_active,
        initial_password=initial_password,
    )


@router.patch("/{user_id}/role", response_model=TeamMemberOut)
async def update_role(
    user_id: int,
    payload: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    _require(user, allow=("owner",))
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {ROLES}")
    target = await db.get(User, user_id)
    if target is None or target.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id and payload.role != "owner":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    target.role = payload.role
    await db.commit()
    await db.refresh(target)
    return target


@router.delete("/{user_id}", response_model=Message)
async def remove_member(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    _require(user, allow=("owner",))
    target = await db.get(User, user_id)
    if target is None or target.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    target.is_active = False
    await db.commit()
    return Message(detail="ok")
