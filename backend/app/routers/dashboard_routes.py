from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import Contact, FollowUpAction, Task, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=schemas.DashboardStats)
def get_stats(
    exhibition_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contacts_q = db.query(Contact).filter(Contact.company_id == user.company_id)
    if exhibition_id:
        contacts_q = contacts_q.filter(Contact.exhibition_id == exhibition_id)

    total = contacts_q.count()
    hot = contacts_q.filter(Contact.status == "hot").count()
    warm = contacts_q.filter(Contact.status == "warm").count()
    cold = contacts_q.filter(Contact.status == "cold").count()

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    contacts_today = contacts_q.filter(Contact.created_at >= today).count()

    tasks_q = db.query(Task).filter(Task.company_id == user.company_id)
    total_tasks = tasks_q.filter(Task.is_done == False).count()
    overdue = tasks_q.filter(
        Task.is_done == False,
        Task.due_date != None,
        Task.due_date < datetime.now(timezone.utc),
    ).count()

    # Avg time from contact creation to first sent follow-up (hours)
    avg_hours = None
    rows = (
        db.query(Contact.id, Contact.created_at, func.min(FollowUpAction.sent_at))
        .outerjoin(FollowUpAction, FollowUpAction.contact_id == Contact.id)
        .filter(Contact.company_id == user.company_id, FollowUpAction.sent_at != None)
        .group_by(Contact.id, Contact.created_at)
        .all()
    )
    if rows:
        deltas = [
            (sent - created).total_seconds() / 3600
            for _id, created, sent in rows
            if sent and created
        ]
        if deltas:
            avg_hours = round(sum(deltas) / len(deltas), 1)

    by_user_rows = (
        db.query(User.name, func.count(Contact.id))
        .join(Contact, Contact.owner_user_id == User.id)
        .filter(Contact.company_id == user.company_id)
        .group_by(User.name)
        .all()
    )
    contacts_by_user = [{"name": n, "count": c} for n, c in by_user_rows]

    return schemas.DashboardStats(
        total_contacts=total,
        hot_contacts=hot,
        warm_contacts=warm,
        cold_contacts=cold,
        total_tasks=total_tasks,
        overdue_tasks=overdue,
        avg_followup_hours=avg_hours,
        contacts_today=contacts_today,
        contacts_by_user=contacts_by_user,
        by_status={"hot": hot, "warm": warm, "cold": cold},
    )
