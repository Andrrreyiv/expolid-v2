from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Contact, FollowUp, Task, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class CountByKey(BaseModel):
    key: str
    count: int


class DashboardStats(BaseModel):
    contacts_total: int
    contacts_today: int
    contacts_active_exhibition: int
    contacts_by_status: list[CountByKey]
    tasks_open: int
    tasks_overdue: int
    followups_total: int
    followups_sent: int
    avg_followup_hours: float | None
    top_users: list[dict]


@router.get("/stats", response_model=DashboardStats)
async def stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardStats:
    org_id = user.organization_id
    now = datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)

    contacts_total = (
        await db.execute(
            select(func.count(Contact.id)).where(Contact.organization_id == org_id)
        )
    ).scalar_one()

    contacts_today = (
        await db.execute(
            select(func.count(Contact.id))
            .where(Contact.organization_id == org_id)
            .where(Contact.created_at >= midnight)
        )
    ).scalar_one()

    if user.active_exhibition_id is not None:
        contacts_active_exhibition = (
            await db.execute(
                select(func.count(Contact.id))
                .where(Contact.organization_id == org_id)
                .where(Contact.exhibition_id == user.active_exhibition_id)
            )
        ).scalar_one()
    else:
        contacts_active_exhibition = 0

    rows = (
        await db.execute(
            select(Contact.status, func.count(Contact.id))
            .where(Contact.organization_id == org_id)
            .group_by(Contact.status)
        )
    ).all()
    contacts_by_status = [CountByKey(key=k or "unknown", count=v) for k, v in rows]

    tasks_open = (
        await db.execute(
            select(func.count(Task.id))
            .where(Task.organization_id == org_id)
            .where(Task.status == "open")
        )
    ).scalar_one()

    tasks_overdue = (
        await db.execute(
            select(func.count(Task.id))
            .where(Task.organization_id == org_id)
            .where(Task.status == "open")
            .where(Task.due_date.isnot(None))
            .where(Task.due_date < now)
        )
    ).scalar_one()

    followups_total = (
        await db.execute(
            select(func.count(FollowUp.id)).where(FollowUp.organization_id == org_id)
        )
    ).scalar_one()

    followups_sent = (
        await db.execute(
            select(func.count(FollowUp.id))
            .where(FollowUp.organization_id == org_id)
            .where(FollowUp.sent_at.isnot(None))
        )
    ).scalar_one()

    # Average hours from contact creation to first follow-up sent
    pair_rows = (
        await db.execute(
            select(Contact.created_at, func.min(FollowUp.sent_at))
            .join(FollowUp, FollowUp.contact_id == Contact.id)
            .where(Contact.organization_id == org_id)
            .where(FollowUp.sent_at.isnot(None))
            .group_by(Contact.id)
        )
    ).all()
    if pair_rows:
        deltas = [
            (sent - created).total_seconds() / 3600.0
            for created, sent in pair_rows
            if created is not None and sent is not None
        ]
        avg_followup_hours = round(sum(deltas) / len(deltas), 2) if deltas else None
    else:
        avg_followup_hours = None

    top_rows = (
        await db.execute(
            select(User.id, User.name, func.count(Contact.id).label("cnt"))
            .join(Contact, Contact.captured_by_id == User.id)
            .where(Contact.organization_id == org_id)
            .group_by(User.id, User.name)
            .order_by(func.count(Contact.id).desc())
            .limit(5)
        )
    ).all()
    top_users = [{"id": uid, "name": name, "count": cnt} for uid, name, cnt in top_rows]

    return DashboardStats(
        contacts_total=contacts_total,
        contacts_today=contacts_today,
        contacts_active_exhibition=contacts_active_exhibition,
        contacts_by_status=contacts_by_status,
        tasks_open=tasks_open,
        tasks_overdue=tasks_overdue,
        followups_total=followups_total,
        followups_sent=followups_sent,
        avg_followup_hours=avg_followup_hours,
        top_users=top_users,
    )
