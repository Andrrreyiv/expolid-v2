from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# Auth -------------------------------------------------------------------------


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)
    organization_name: str | None = Field(default=None, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    role: str
    organization_id: int
    active_exhibition_id: int | None = None


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


# Exhibitions -----------------------------------------------------------------


class ExhibitionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class ExhibitionUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_archived: bool | None = None


class ExhibitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    location: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    is_archived: bool
    created_at: datetime


# Contacts --------------------------------------------------------------------


class ContactBase(BaseModel):
    name: str | None = None
    company: str | None = None
    position: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    telegram: str | None = None
    whatsapp: str | None = None
    linkedin: str | None = None

    card_belongs_to_other: bool = False
    card_owner_name: str | None = None
    card_owner_position: str | None = None
    card_owner_email: str | None = None
    card_owner_phone: str | None = None

    contact_type: str | None = None
    status: str = "new"
    pavilion: str | None = None
    stand: str | None = None

    note: str | None = None


class ContactIn(ContactBase):
    exhibition_id: int | None = None
    assignee_id: int | None = None
    card_image_url: str | None = None
    person_image_url: str | None = None
    voice_url: str | None = None
    voice_transcript: str | None = None


class ContactUpdate(ContactBase):
    assignee_id: int | None = None


class ContactOut(ContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    exhibition_id: int | None
    captured_by_id: int | None
    assignee_id: int | None

    card_image_url: str | None = None
    person_image_url: str | None = None
    voice_url: str | None = None
    voice_transcript: str | None = None

    ai_summary: str | None = None
    ai_agreements: str | None = None
    ai_next_step: str | None = None
    ai_score: int | None = None
    ai_score_reason: str | None = None

    created_at: datetime
    updated_at: datetime


# Tasks -----------------------------------------------------------------------


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    due_date: datetime | None = None
    contact_id: int
    assignee_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    status: str | None = None
    assignee_id: int | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    due_date: datetime | None
    status: str
    contact_id: int
    assignee_id: int | None
    created_at: datetime
    completed_at: datetime | None


# Generic ---------------------------------------------------------------------


class Message(BaseModel):
    detail: str
