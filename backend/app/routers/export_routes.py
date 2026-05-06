import io
from datetime import datetime

import openpyxl
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import Contact, Exhibition, User

router = APIRouter(prefix="/api/export", tags=["export"])


HEADERS = [
    "Дата",
    "Выставка",
    "ФИО",
    "Компания",
    "Должность",
    "Телефон",
    "Email",
    "Сайт",
    "Telegram",
    "WhatsApp",
    "LinkedIn",
    "Тип",
    "Статус",
    "AI-балл",
    "Резюме",
    "Договорённости",
    "Следующий шаг",
    "Дата напоминания",
    "Связан с (визитка)",
    "Поговорил с",
    "Менеджер",
    "Павильон",
    "Стенд",
    "Источник",
]

TYPE_LABELS = {
    "client": "Клиент",
    "partner": "Партнёр",
    "supplier": "Поставщик",
    "investor": "Инвестор",
    "other": "Другое",
}
STATUS_LABELS = {"hot": "Горячий", "warm": "Тёплый", "cold": "Холодный"}


@router.get("/contacts.xlsx")
def export_contacts(
    exhibition_id: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Contact).filter(Contact.company_id == user.company_id)
    if exhibition_id:
        query = query.filter(Contact.exhibition_id == exhibition_id)
    contacts = query.order_by(Contact.created_at.asc()).all()

    exh_map = {
        e.id: e.name
        for e in db.query(Exhibition)
        .filter(Exhibition.company_id == user.company_id)
        .all()
    }
    user_map = {
        u.id: u.name
        for u in db.query(User).filter(User.company_id == user.company_id).all()
    }

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Контакты"
    ws.append(HEADERS)

    for c in contacts:
        ws.append(
            [
                c.created_at.strftime("%d.%m.%Y") if c.created_at else "",
                exh_map.get(c.exhibition_id, ""),
                c.name or "",
                c.contact_company or "",
                c.role_title or "",
                c.phone or "",
                c.email or "",
                c.website or "",
                c.telegram or "",
                c.whatsapp or "",
                c.linkedin or "",
                TYPE_LABELS.get(c.contact_type, c.contact_type),
                STATUS_LABELS.get(c.status, c.status),
                c.ai_score if c.ai_score is not None else "",
                c.summary or "",
                c.agreements or "",
                c.next_step or "",
                c.reminder_at.strftime("%d.%m.%Y") if c.reminder_at else "",
                "не владелец визитки"
                if not c.talked_to_card_owner
                else "",
                (c.talked_to_name or "") + (f" ({c.talked_to_role})" if c.talked_to_role else ""),
                user_map.get(c.assigned_user_id or c.owner_user_id, ""),
                c.pavilion or "",
                c.stand or "",
                "Визитка/Голос/Заметка",
            ]
        )

    for col_idx, header in enumerate(HEADERS, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = max(
            12, min(40, len(header) + 4)
        )

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    today = datetime.utcnow().strftime("%Y-%m-%d")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="contacts_{today}.xlsx"'
        },
    )
