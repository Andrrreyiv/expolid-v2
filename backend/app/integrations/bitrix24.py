"""Bitrix24 REST integration via inbound webhook (P1.8).

Простой вариант: пользователь создаёт «входящий webhook» в Bitrix24
(Разработчикам → Другое → Входящий вебхук), копирует URL вида:
  https://<portal>.bitrix24.ru/rest/<user_id>/<webhook_token>/

Этого URL достаточно, чтобы создавать контакты + сделки.

Минимальный функционал: push_contact (CRM contact + deal) и health-check.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from ..models import CompanyIntegration, Contact

logger = logging.getLogger(__name__)
PROVIDER = "bitrix24"


def _config(rec: CompanyIntegration | None) -> dict:
    if not rec:
        return {}
    try:
        return json.loads(rec.config_json or "{}")
    except json.JSONDecodeError:
        return {}


def get_integration(db: Session, company_id: str) -> CompanyIntegration | None:
    return (
        db.query(CompanyIntegration)
        .filter(
            CompanyIntegration.company_id == company_id,
            CompanyIntegration.provider == PROVIDER,
        )
        .first()
    )


def upsert_webhook(db: Session, company_id: str, webhook_url: str) -> CompanyIntegration:
    """Сохранить входящий-webhook URL Bitrix24."""
    if not webhook_url.startswith("https://"):
        raise ValueError("webhook_url должен быть https://...bitrix24.<tld>/rest/<id>/<token>/")
    rec = get_integration(db, company_id)
    cfg = {"webhook_url": webhook_url.rstrip("/") + "/"}
    if not rec:
        rec = CompanyIntegration(
            company_id=company_id,
            provider=PROVIDER,
            config_json=json.dumps(cfg, ensure_ascii=False),
            is_enabled=True,
        )
        db.add(rec)
    else:
        rec.config_json = json.dumps(cfg, ensure_ascii=False)
        rec.is_enabled = True
        rec.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rec)
    return rec


def disable(db: Session, company_id: str) -> bool:
    rec = get_integration(db, company_id)
    if rec:
        rec.is_enabled = False
        db.commit()
        return True
    return False


def _post(webhook_url: str, method: str, params: dict[str, Any]) -> dict:
    url = f"{webhook_url}{method}.json"
    with httpx.Client(timeout=20.0) as cl:
        r = cl.post(url, json=params)
        r.raise_for_status()
        return r.json()


def health(db: Session, company_id: str) -> dict[str, Any]:
    rec = get_integration(db, company_id)
    if not rec or not rec.is_enabled:
        return {"connected": False}
    cfg = _config(rec)
    url = cfg.get("webhook_url")
    if not url:
        return {"connected": False, "error": "webhook не настроен"}
    try:
        data = _post(url, "profile", {})
        if "result" in data:
            return {"connected": True, "user": data["result"].get("NAME")}
        return {"connected": False, "error": data.get("error_description") or "unknown"}
    except httpx.HTTPError as e:
        return {"connected": False, "error": str(e)}


def push_contact(db: Session, company_id: str, contact: Contact) -> dict[str, Any]:
    rec = get_integration(db, company_id)
    if not rec or not rec.is_enabled:
        raise RuntimeError("Bitrix24 не подключён")
    cfg = _config(rec)
    url = cfg.get("webhook_url")
    if not url:
        raise RuntimeError("Bitrix24 webhook не настроен")

    fields: dict[str, Any] = {
        "NAME": contact.name or "Без имени",
        "OPENED": "Y",
        "TYPE_ID": "CLIENT",
        "ASSIGNED_BY_ID": 1,
    }
    if contact.role_title:
        fields["POST"] = contact.role_title
    if contact.contact_company:
        fields["COMPANY_TITLE"] = contact.contact_company
    if contact.phone:
        fields["PHONE"] = [{"VALUE": contact.phone, "VALUE_TYPE": "WORK"}]
    if contact.email:
        fields["EMAIL"] = [{"VALUE": contact.email, "VALUE_TYPE": "WORK"}]

    contact_resp = _post(url, "crm.contact.add", {"fields": fields})
    contact_id = contact_resp.get("result")

    # Создаём сделку, если есть статус "hot" / "warm"
    deal_id = None
    deal_fields: dict[str, Any] = {
        "TITLE": f"{contact.contact_company or contact.name or 'Лид'} — {contact.status}",
        "STAGE_ID": "NEW",
        "OPENED": "Y",
    }
    if contact_id:
        deal_fields["CONTACT_ID"] = contact_id
    deal_resp = _post(url, "crm.deal.add", {"fields": deal_fields})
    deal_id = deal_resp.get("result")

    # Заметка
    note_parts = []
    if contact.summary:
        note_parts.append(f"Резюме: {contact.summary}")
    if contact.agreements:
        note_parts.append(f"Договорённости: {contact.agreements}")
    if contact.next_step:
        note_parts.append(f"Следующий шаг: {contact.next_step}")
    note_text = "\n".join(note_parts) or "Создано через ЭкспоЛид"
    if contact_id and note_text:
        try:
            _post(url, "crm.timeline.comment.add", {
                "fields": {"ENTITY_ID": contact_id, "ENTITY_TYPE": "contact", "COMMENT": note_text}
            })
        except Exception:  # noqa: BLE001
            pass

    return {"contact_id": contact_id, "deal_id": deal_id}
