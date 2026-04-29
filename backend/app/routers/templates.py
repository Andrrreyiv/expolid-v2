from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import FollowUpTemplate, User
from app.schemas import Message

router = APIRouter(prefix="/api/templates", tags=["templates"])


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: str  # email | proposal | invitation | call_script
    subject: str | None = None
    body: str
    is_default: bool = False


class TemplateUpdate(BaseModel):
    name: str | None = None
    kind: str | None = None
    subject: str | None = None
    body: str | None = None
    is_default: bool | None = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: str
    subject: str | None
    body: str
    is_default: bool


# Seed templates created when a user first opens templates list. Russian wording
# follows the original ExpoLid v1 templates style.
DEFAULT_TEMPLATES: list[TemplateIn] = [
    TemplateIn(
        kind="email",
        name="Письмо после знакомства",
        is_default=True,
        subject="{{name}}, рад знакомству на {{event}}",
        body=(
            "Здравствуйте, {{name}}!\n\n"
            "Был рад познакомиться на {{event}}. Как договорились, отправляю вам нашу краткую "
            "презентацию и кейс по {{case}}.\n\n"
            "Готов созвониться на следующей неделе и обсудить, как мы можем быть полезны "
            "{{company}} — у нас как раз есть {{discount}}% скидка на первый проект до конца "
            "месяца.\n\n"
            "С уважением,\n{{my_name}}"
        ),
    ),
    TemplateIn(
        kind="proposal",
        name="Коммерческое предложение",
        is_default=True,
        subject="КП для {{company}} — {{topic}}",
        body=(
            "Уважаемый(ая) {{name}},\n\n"
            "Высылаю коммерческое предложение по {{topic}} для {{company}} согласно нашей "
            "договорённости на {{event}}.\n\n"
            "Ключевые условия:\n"
            "• Объём работ: {{scope}}\n"
            "• Срок: {{deadline}}\n"
            "• Стоимость: {{price}} (со скидкой {{discount}}%)\n\n"
            "Готов обсудить детали и подписать договор в ближайшее время.\n\n"
            "С уважением,\n{{my_name}}"
        ),
    ),
    TemplateIn(
        kind="invitation",
        name="Приглашение в офис / на демо",
        is_default=True,
        subject="{{name}}, приглашение на {{event_kind}}",
        body=(
            "Здравствуйте, {{name}}!\n\n"
            "Хотел бы пригласить вас на {{event_kind}} в {{showroom}} — покажем {{topic}} вживую "
            "и обсудим, как это решит задачи {{company}}.\n\n"
            "Удобно ли вам {{date}}?\n\n"
            "С уважением,\n{{my_name}}"
        ),
    ),
    TemplateIn(
        kind="call_script",
        name="Скрипт первого звонка",
        is_default=True,
        subject=None,
        body=(
            "Цель звонка: договориться о следующем шаге (демо/встреча/КП).\n\n"
            "1. Приветствие и контекст\n"
            "   «Здравствуйте, {{name}}! Это {{my_name}}, мы познакомились на {{event}}.»\n\n"
            "2. Подтвердить интерес\n"
            "   «Помните, мы обсуждали {{topic}}? Я хотел бы продолжить разговор.»\n\n"
            "3. Уточняющие вопросы (выбрать 1-2):\n"
            "   • Какие задачи сейчас приоритетны для {{company}} в этой области?\n"
            "   • С какими сложностями сталкиваетесь сейчас?\n"
            "   • Кто принимает решение по подобным вопросам?\n\n"
            "4. Предложение следующего шага\n"
            "   «Предлагаю встретиться/созвониться на {{date}} — покажу {{showcase}}.»\n\n"
            "5. Closing\n"
            "   «Договорились, я вышлю приглашение в календарь.»"
        ),
    ),
]


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FollowUpTemplate]:
    stmt = select(FollowUpTemplate).where(
        FollowUpTemplate.organization_id == user.organization_id
    )
    res = await db.execute(stmt)
    items = list(res.scalars().all())
    if not items:
        # First-time visit: seed default templates
        for t in DEFAULT_TEMPLATES:
            db.add(
                FollowUpTemplate(
                    organization_id=user.organization_id,
                    name=t.name,
                    kind=t.kind,
                    subject=t.subject,
                    body=t.body,
                    is_default=t.is_default,
                )
            )
        await db.commit()
        res = await db.execute(stmt)
        items = list(res.scalars().all())
    return items


@router.post("", response_model=TemplateOut)
async def create_template(
    payload: TemplateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowUpTemplate:
    template = FollowUpTemplate(
        organization_id=user.organization_id,
        name=payload.name,
        kind=payload.kind,
        subject=payload.subject,
        body=payload.body,
        is_default=payload.is_default,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.patch("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: int,
    payload: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowUpTemplate:
    t = await db.get(FollowUpTemplate, template_id)
    if t is None or t.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(t, field, value)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/{template_id}", response_model=Message)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Message:
    t = await db.get(FollowUpTemplate, template_id)
    if t is None or t.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
    return Message(detail="ok")
