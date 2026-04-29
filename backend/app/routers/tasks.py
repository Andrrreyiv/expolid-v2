from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Contact, Task, User
from app.schemas import Message, TaskIn, TaskOut, TaskUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    status: str | None = None,
    contact_id: int | None = None,
    assignee_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Task]:
    stmt = select(Task).where(Task.organization_id == user.organization_id)
    if status:
        stmt = stmt.where(Task.status == status)
    if contact_id is not None:
        stmt = stmt.where(Task.contact_id == contact_id)
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    stmt = stmt.order_by(Task.due_date.is_(None), Task.due_date.asc(), Task.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=TaskOut)
async def create_task(
    payload: TaskIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Task:
    contact = await db.get(Contact, payload.contact_id)
    if contact is None or contact.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    task = Task(
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        contact_id=payload.contact_id,
        assignee_id=payload.assignee_id or user.id,
        organization_id=user.organization_id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Task:
    task = await db.get(Task, task_id)
    if task is None or task.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Task not found")
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] == "done" and task.status != "done":
        task.completed_at = datetime.now(timezone.utc)
    if "status" in data and data["status"] != "done":
        task.completed_at = None
    for field, value in data.items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", response_model=Message)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    task = await db.get(Task, task_id)
    if task is None or task.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
    return Message(detail="ok")
