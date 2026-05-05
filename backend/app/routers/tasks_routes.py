from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..models import Task, User

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return (
        db.query(Task)
        .filter(Task.company_id == user.company_id)
        .order_by(Task.is_done.asc(), Task.due_date.asc().nullslast())
        .all()
    )


@router.post("", response_model=schemas.TaskOut)
def create_task(
    payload: schemas.TaskCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = Task(
        company_id=user.company_id,
        contact_id=payload.contact_id,
        assignee_user_id=payload.assignee_user_id or user.id,
        title=payload.title,
        due_date=payload.due_date,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def update_task(
    task_id: str,
    payload: schemas.TaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = (
        db.query(Task)
        .filter(Task.id == task_id, Task.company_id == user.company_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(t, k, v)
    if t.is_done and not t.done_at:
        t.done_at = datetime.now(timezone.utc)
    if not t.is_done:
        t.done_at = None
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{task_id}")
def delete_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = (
        db.query(Task)
        .filter(Task.id == task_id, Task.company_id == user.company_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    db.delete(t)
    db.commit()
    return {"ok": True}
