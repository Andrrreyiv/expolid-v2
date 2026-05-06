from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Date, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    email_signature: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    users: Mapped[list["User"]] = relationship(back_populates="company")
    exhibitions: Mapped[list["Exhibition"]] = relationship(back_populates="company")
    proposal_templates: Mapped[list["ProposalTemplate"]] = relationship(
        back_populates="company"
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="owner")  # owner|manager|staff
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    telegram_chat_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    company: Mapped[Company] = relationship(back_populates="users")
    contacts: Mapped[list["Contact"]] = relationship(
        back_populates="owner_user", foreign_keys="Contact.owner_user_id"
    )


class Exhibition(Base):
    __tablename__ = "exhibitions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    venue: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    company: Mapped[Company] = relationship(back_populates="exhibitions")
    contacts: Mapped[list["Contact"]] = relationship(back_populates="exhibition")


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    exhibition_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("exhibitions.id"), nullable=True, index=True
    )
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    assigned_user_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    name: Mapped[str] = mapped_column(String(255))
    contact_company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    telegram: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    linkedin: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    contact_type: Mapped[str] = mapped_column(String(32), default="client")
    status: Mapped[str] = mapped_column(String(32), default="warm")  # hot|warm|cold

    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    agreements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_step: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reminder_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    voice_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes_raw: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    ai_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ai_score_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    talked_to_card_owner: Mapped[bool] = mapped_column(Boolean, default=True)
    talked_to_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    talked_to_role: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    linked_contact_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("contacts.id"), nullable=True
    )

    pavilion: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    stand: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Quiz-ответы на анкету квалификации (P0.1)
    qualification_answers: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    qualification_template_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("qualification_templates.id"), nullable=True
    )

    # GDPR / 152-ФЗ согласие (P0.4)
    consent_given_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    consent_text_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    consent_source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    erased_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Источник захвата (для analytics + universal badge scan, P0.2)
    capture_source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    badge_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Контекст-обогащение (P1.6)
    enrichment_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    enriched_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    exhibition: Mapped[Optional[Exhibition]] = relationship(back_populates="contacts")
    owner_user: Mapped[User] = relationship(
        back_populates="contacts", foreign_keys=[owner_user_id]
    )
    media: Mapped[list["ContactMedia"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )
    follow_ups: Mapped[list["FollowUpAction"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )


class ContactMedia(Base):
    __tablename__ = "contact_media"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))  # card|person|extra|voice
    file_path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    contact: Mapped[Contact] = relationship(back_populates="media")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    contact_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("contacts.id"), nullable=True, index=True
    )
    assignee_user_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(500))
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_push_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    contact: Mapped[Optional[Contact]] = relationship(back_populates="tasks")


class FollowUpAction(Base):
    __tablename__ = "follow_up_actions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    contact_id: Mapped[str] = mapped_column(ForeignKey("contacts.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))  # intro|proposal|invite|call
    personalization: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subject: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachments_meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft|sent|cancelled
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    contact: Mapped[Contact] = relationship(back_populates="follow_ups")


class ProposalTemplate(Base):
    __tablename__ = "proposal_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))  # intro|proposal|invite|call
    name: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    company: Mapped[Company] = relationship(back_populates="proposal_templates")


class QualificationTemplate(Base):
    """Шаблон анкеты квалификации лида (P0.1).

    questions: JSON-список вопросов вида:
      [{"id": "q1", "type": "single|multi|rating|text|number|bool",
        "text": "Какой бюджет?", "required": true,
        "options": [{"value": "small", "label": "до 100к", "score": 5}, ...],
        "branch": {"if_value": "X", "goto": "q3"}  # P1.5 branching
      }]
    """

    __tablename__ = "qualification_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    questions: Mapped[list] = mapped_column(JSON, default=list)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class RoutingRule(Base):
    """Правила автоматического распределения лидов (P1.7).

    conditions: JSON, описание триггера:
      {"all": [{"field": "status", "op": "eq", "value": "hot"},
                {"field": "qualification_answers.budget", "op": "gte", "value": 1000000}]}
    action: либо assign_user_id, либо round_robin внутри списка users.
    """

    __tablename__ = "routing_rules"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    priority: Mapped[int] = mapped_column(Integer, default=100)
    conditions: Mapped[dict] = mapped_column(JSON, default=dict)
    action_type: Mapped[str] = mapped_column(String(32))  # assign|round_robin|tag
    action_data: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_assigned_idx: Mapped[int] = mapped_column(Integer, default=0)  # для round_robin


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255))
    auth: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TelegramLinkCode(Base):
    __tablename__ = "telegram_link_codes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CompanyIntegration(Base):
    __tablename__ = "company_integrations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)  # amocrm|bitrix24|telegram
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
