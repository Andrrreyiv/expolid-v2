from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..db import get_db
from ..models import Company, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=schemas.TokenResponse)
def signup(payload: schemas.SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с таким email уже зарегистрирован",
        )
    company_name = (payload.company_name or "").strip() or "Моя компания"
    company = Company(name=company_name)
    db.add(company)
    db.flush()
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        name=payload.name,
        role="owner",
        company_id=company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return schemas.TokenResponse(access_token=create_access_token(user.id))


@router.post("/signin", response_model=schemas.TokenResponse)
def signin(payload: schemas.SigninRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )
    expires_minutes = 60 * 24 * 30 if payload.remember_me else 60 * 24 * 7
    return schemas.TokenResponse(
        access_token=create_access_token(user.id, expires_minutes=expires_minutes)
    )


@router.get("/me", response_model=schemas.MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == user.company_id).first()
    return schemas.MeResponse(
        user=schemas.UserOut.model_validate(user),
        company=schemas.CompanyOut.model_validate(company),
    )


@router.patch("/company", response_model=schemas.CompanyOut)
def update_company(
    payload: schemas.CompanyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in ("owner", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только владелец или менеджер может изменять компанию",
        )
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if payload.name is not None:
        company.name = payload.name.strip()
    if payload.email_signature is not None:
        company.email_signature = payload.email_signature
    db.commit()
    db.refresh(company)
    return schemas.CompanyOut.model_validate(company)
