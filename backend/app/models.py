"""SQLAlchemy ORM models for ExpoLid v2.

Domain:
- Organization: a company that uses ExpoLid (multi-tenant root).
- User: a member of an organization with a role (owner/manager/staff).
- Exhibition: an event the org attends; contacts are scoped to an exhibition.
- Contact: a captured lead. Supports the multi-contact pattern (visitka_X__talked_with_Y)
  via card_owner_* fields when separate from the actual interlocutor.
- Task: follow-up action item with due_date + status.
- FollowUp: generated message/CP/invitation/call-script tied to a contact.
- FollowUpTemplate: per-org reusable template for follow-up generation.
- PushSubscription: Web Push endpoint per user.
- TelegramLink: pairing code → user_id link for the Telegram bot.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Enum-like string constants ----------------------------------------------------

ROLE_OWNER = "owner"
ROLE_MANAGER = "manager"
ROLE_STAFF = "staff"
ROLES = (ROLE_OWNER, ROLE_MANAGER, ROLE_STAFF)

CONTACT_TYPES = ("client", "partner", "vendor", "media", "other")
CONTACT_STATUSES = ("hot", "warm", "cold", "won", "lost", "new")

FOLLOWUP_KINDS = ("email", "proposal", "invitation", "call_script")

TASK_STATUSES = ("open", "done", "cancelled")


# ------------------------------------------------------------------------------


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    users: Mapped[list["User"]] = relationship(back_populates="organization")
    exhibitions: Mapped[list["Exhibition"]] = relationship(back_populates="organization")
    contacts: Mapped[list["Contact"]] = relationship(back_populates="organization")
    templates: Mapped[list["FollowUpTemplate"]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=ROLE_OWNER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    organization: Mapped["Organization"] = relationship(back_populates="users")

    active_exhibition_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("exhibitions.id", use_alter=True, name="fk_users_active_exhibition"), nullable=True
    )

    contacts_owned: Mapped[list["Contact"]] = relationship(
        back_populates="captured_by", foreign_keys="Contact.captured_by_id"
    )
    tasks_assigned: Mapped[list["Task"]] = relationship(
        back_populates="assignee", foreign_keys="Task.assignee_id"
    )
    push_subscriptions: Mapped[list["PushSubscription"]] = relationship(back_populates="user")


class Exhibition(Base):
    __tablename__ = "exhibitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    organization: Mapped["Organization"] = relationship(back_populates="exhibitions")

    contacts: Mapped[list["Contact"]] = relationship(back_populates="exhibition")


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # The actual person you talked with (interlocutor)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    position: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(120), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(120), nullable=True)
    linkedin: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Multi-contact pattern: business card belongs to someone else
    card_belongs_to_other: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    card_owner_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    card_owner_position: Mapped[str | None] = mapped_column(String(200), nullable=True)
    card_owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    card_owner_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Tagging
    contact_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="new", nullable=False)

    # Stand & location
    pavilion: Mapped[str | None] = mapped_column(String(80), nullable=True)
    stand: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Captured assets (paths or URLs)
    card_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    person_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    voice_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    voice_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI-derived fields (filled when OpenAI key present)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_agreements: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_next_step: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_score_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    organization: Mapped["Organization"] = relationship(back_populates="contacts")

    exhibition_id: Mapped[int | None] = mapped_column(ForeignKey("exhibitions.id"), nullable=True, index=True)
    exhibition: Mapped["Exhibition"] = relationship(back_populates="contacts")

    captured_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    captured_by: Mapped["User"] = relationship(back_populates="contacts_owned", foreign_keys=[captured_by_id])

    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assignee: Mapped[Optional["User"]] = relationship(foreign_keys=[assignee_id])

    tasks: Mapped[list["Task"]] = relationship(back_populates="contact", cascade="all, delete-orphan")
    followups: Mapped[list["FollowUp"]] = relationship(
        back_populates="contact", cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id"), nullable=False, index=True)
    contact: Mapped["Contact"] = relationship(back_populates="tasks")

    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assignee: Mapped[Optional["User"]] = relationship(
        back_populates="tasks_assigned", foreign_keys=[assignee_id]
    )

    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)


class FollowUp(Base):
    __tablename__ = "followups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)  # email/proposal/invitation/call_script
    subject: Mapped[str | None] = mapped_column(String(300), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    personalization: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id"), nullable=False, index=True)
    contact: Mapped["Contact"] = relationship(back_populates="followups")

    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)


class FollowUpTemplate(Base):
    __tablename__ = "followup_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(300), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    organization: Mapped["Organization"] = relationship(back_populates="templates")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    endpoint: Mapped[str] = mapped_column(String(800), nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    user: Mapped["User"] = relationship(back_populates="push_subscriptions")


class TelegramLink(Base):
    __tablename__ = "telegram_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pairing_code: Mapped[str] = mapped_column(String(16), unique=True, index=True, nullable=False)
    telegram_chat_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telegram_username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    paired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True, unique=True)
