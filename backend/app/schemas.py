from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    company_name: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    email_signature: Optional[str] = None


class SigninRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(_Base):
    id: str
    email: EmailStr
    name: str
    role: str
    company_id: str


class CompanyOut(_Base):
    id: str
    name: str
    email_signature: Optional[str] = None


class MeResponse(BaseModel):
    user: UserOut
    company: CompanyOut


# ---------- Exhibitions ----------
class ExhibitionCreate(BaseModel):
    name: str
    city: Optional[str] = None
    venue: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ExhibitionUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    venue: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class ExhibitionOut(_Base):
    id: str
    name: str
    city: Optional[str] = None
    venue: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool


# ---------- Contacts ----------
class ContactBase(BaseModel):
    name: str
    contact_company: Optional[str] = None
    role_title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    telegram: Optional[str] = None
    whatsapp: Optional[str] = None
    linkedin: Optional[str] = None
    contact_type: str = "client"
    status: str = "warm"
    summary: Optional[str] = None
    agreements: Optional[str] = None
    next_step: Optional[str] = None
    reminder_at: Optional[datetime] = None
    talked_to_card_owner: bool = True
    talked_to_name: Optional[str] = None
    talked_to_role: Optional[str] = None
    pavilion: Optional[str] = None
    stand: Optional[str] = None


class ContactCreate(ContactBase):
    exhibition_id: Optional[str] = None
    notes_raw: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    contact_company: Optional[str] = None
    role_title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    telegram: Optional[str] = None
    whatsapp: Optional[str] = None
    linkedin: Optional[str] = None
    contact_type: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None
    agreements: Optional[str] = None
    next_step: Optional[str] = None
    reminder_at: Optional[datetime] = None
    talked_to_card_owner: Optional[bool] = None
    talked_to_name: Optional[str] = None
    talked_to_role: Optional[str] = None
    pavilion: Optional[str] = None
    stand: Optional[str] = None
    exhibition_id: Optional[str] = None
    assigned_user_id: Optional[str] = None


class ContactMediaOut(_Base):
    id: str
    kind: str
    file_path: str
    mime_type: Optional[str] = None
    transcript: Optional[str] = None


class ContactOut(_Base):
    id: str
    exhibition_id: Optional[str] = None
    owner_user_id: str
    assigned_user_id: Optional[str] = None
    name: str
    contact_company: Optional[str] = None
    role_title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    telegram: Optional[str] = None
    whatsapp: Optional[str] = None
    linkedin: Optional[str] = None
    contact_type: str
    status: str
    summary: Optional[str] = None
    agreements: Optional[str] = None
    next_step: Optional[str] = None
    reminder_at: Optional[datetime] = None
    voice_transcript: Optional[str] = None
    notes_raw: Optional[str] = None
    ai_score: Optional[int] = None
    ai_score_reason: Optional[str] = None
    talked_to_card_owner: bool
    talked_to_name: Optional[str] = None
    talked_to_role: Optional[str] = None
    linked_contact_id: Optional[str] = None
    pavilion: Optional[str] = None
    stand: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    media: list[ContactMediaOut] = []


# ---------- Tasks ----------
class TaskCreate(BaseModel):
    title: str
    contact_id: Optional[str] = None
    due_date: Optional[datetime] = None
    assignee_user_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    is_done: Optional[bool] = None
    due_date: Optional[datetime] = None
    assignee_user_id: Optional[str] = None


class TaskOut(_Base):
    id: str
    contact_id: Optional[str] = None
    assignee_user_id: Optional[str] = None
    title: str
    due_date: Optional[datetime] = None
    is_done: bool
    done_at: Optional[datetime] = None
    created_at: datetime


# ---------- Follow-up ----------
class FollowUpDraftRequest(BaseModel):
    contact_id: str
    kind: str  # intro|proposal|invite|call
    personalization: Optional[str] = None
    template_id: Optional[str] = None


class FollowUpOut(_Base):
    id: str
    contact_id: str
    kind: str
    personalization: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    status: str
    sent_at: Optional[datetime] = None
    created_at: datetime


class FollowUpUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None


# ---------- Templates ----------
class ProposalTemplateCreate(BaseModel):
    kind: str
    name: str
    body: str
    is_default: bool = False


class ProposalTemplateOut(_Base):
    id: str
    kind: str
    name: str
    body: str
    is_default: bool


# ---------- Team ----------
class TeamMemberInvite(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=6)
    role: str = "staff"


class TeamMemberOut(_Base):
    id: str
    email: EmailStr
    name: str
    role: str
    is_active: bool


# ---------- AI capture ----------
class AICaptureProcessResponse(BaseModel):
    name: Optional[str] = None
    contact_company: Optional[str] = None
    role_title: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    telegram: Optional[str] = None
    whatsapp: Optional[str] = None
    linkedin: Optional[str] = None
    summary: Optional[str] = None
    agreements: Optional[str] = None
    next_step: Optional[str] = None
    reminder_in_days: Optional[int] = None
    voice_transcript: Optional[str] = None
    ai_score: Optional[int] = None
    ai_score_reason: Optional[str] = None
    qr_payload: Optional[str] = None


# ---------- Dashboard ----------
class DashboardStats(BaseModel):
    total_contacts: int
    hot_contacts: int
    warm_contacts: int
    cold_contacts: int
    total_tasks: int
    overdue_tasks: int
    avg_followup_hours: Optional[float] = None
    contacts_today: int
    contacts_by_user: list[dict]
    by_status: dict
