"""amoCRM REST integration. Uses long-lived integration token + subdomain.

Docs: https://www.amocrm.ru/developers/content/oauth/step-by-step
For simplicity, we accept access_token (long-lived) directly. OAuth callback
flow is also implemented for the standard 3-legged flow.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from ..models import CompanyIntegration, Contact

logger = logging.getLogger(__name__)


def _config(rec: CompanyIntegration) -> dict:
    try:
        return json.loads(rec.config_json or "{}")
    except json.JSONDecodeError:
        return {}


def _save(db: Session, rec: CompanyIntegration, cfg: dict) -> None:
    rec.config_json = json.dumps(cfg, ensure_ascii=False)
    rec.updated_at = datetime.now(timezone.utc)
    db.commit()


def get_integration(db: Session, company_id: str) -> CompanyIntegration | None:
    return (
        db.query(CompanyIntegration)
        .filter(
            CompanyIntegration.company_id == company_id,
            CompanyIntegration.provider == "amocrm",
        )
        .first()
    )


def upsert_token(
    db: Session,
    company_id: str,
    *,
    subdomain: str,
    access_token: str,
    refresh_token: str | None = None,
    expires_in: int | None = None,
) -> CompanyIntegration:
    rec = get_integration(db, company_id)
    cfg = _config(rec) if rec else {}
    cfg["subdomain"] = subdomain.replace(".amocrm.ru", "").replace("https://", "").strip("/")
    cfg["access_token"] = access_token
    if refresh_token:
        cfg["refresh_token"] = refresh_token
    if expires_in:
        cfg["expires_at"] = (
            datetime.now(timezone.utc) + timedelta(seconds=int(expires_in) - 60)
        ).isoformat()
    if not rec:
        rec = CompanyIntegration(
            company_id=company_id,
            provider="amocrm",
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


def _client(rec: CompanyIntegration) -> httpx.Client:
    cfg = _config(rec)
    return httpx.Client(
        base_url=f"https://{cfg['subdomain']}.amocrm.ru",
        headers={"Authorization": f"Bearer {cfg['access_token']}"},
        timeout=20.0,
    )


def health(db: Session, company_id: str) -> dict[str, Any]:
    rec = get_integration(db, company_id)
    if not rec or not rec.is_enabled:
        return {"connected": False}
    try:
        with _client(rec) as cl:
            r = cl.get("/api/v4/account")
            if r.status_code != 200:
                return {"connected": False, "error": f"HTTP {r.status_code}", "subdomain": _config(rec).get("subdomain")}
            return {"connected": True, "account": r.json().get("name"), "subdomain": _config(rec).get("subdomain")}
    except httpx.HTTPError as e:
        return {"connected": False, "error": str(e)}


def push_contact(db: Session, company_id: str, contact: Contact) -> dict[str, Any]:
    rec = get_integration(db, company_id)
    if not rec or not rec.is_enabled:
        raise RuntimeError("amoCRM не подключён")

    payload_contact = {
        "name": contact.name or "Без имени",
        "custom_fields_values": [],
    }
    if contact.phone:
        payload_contact["custom_fields_values"].append(
            {"field_code": "PHONE", "values": [{"value": contact.phone, "enum_code": "WORK"}]}
        )
    if contact.email:
        payload_contact["custom_fields_values"].append(
            {"field_code": "EMAIL", "values": [{"value": contact.email, "enum_code": "WORK"}]}
        )
    if contact.role_title:
        payload_contact["custom_fields_values"].append(
            {"field_code": "POSITION", "values": [{"value": contact.role_title}]}
        )

    payload_lead = {
        "name": f"{contact.contact_company or contact.name or 'Лид'} — {contact.status}",
        "_embedded": {
            "contacts": [{"first_name": contact.name or "Без имени"}],
        },
    }
    if contact.contact_company:
        payload_lead["_embedded"]["companies"] = [{"name": contact.contact_company}]

    note_parts = []
    if contact.summary: note_parts.append(f"Резюме: {contact.summary}")
    if contact.agreements: note_parts.append(f"Договорённости: {contact.agreements}")
    if contact.next_step: note_parts.append(f"Следующий шаг: {contact.next_step}")
    if contact.voice_transcript: note_parts.append(f"Транскрипт: {contact.voice_transcript[:1000]}")
    note_text = "\n".join(note_parts) or "Создано через ЭкспоЛид"

    with _client(rec) as cl:
        # Create contact
        rc = cl.post("/api/v4/contacts", json=[payload_contact])
        if rc.status_code >= 400:
            raise RuntimeError(f"amoCRM contact error: {rc.status_code} {rc.text}")
        contact_amo_id = rc.json()["_embedded"]["contacts"][0]["id"]

        # Create lead linked to contact
        payload_lead["_embedded"]["contacts"] = [{"id": contact_amo_id}]
        rl = cl.post("/api/v4/leads/complex", json=[payload_lead])
        if rl.status_code >= 400:
            raise RuntimeError(f"amoCRM lead error: {rl.status_code} {rl.text}")
        lead_amo_id = rl.json()[0]["id"]

        # Add note to lead
        cl.post(
            f"/api/v4/leads/{lead_amo_id}/notes",
            json=[{"note_type": "common", "params": {"text": note_text}}],
        )

    cfg = _config(rec)
    cfg.setdefault("pushed_contacts", {})[contact.id] = {
        "amo_contact_id": contact_amo_id, "amo_lead_id": lead_amo_id,
        "pushed_at": datetime.now(timezone.utc).isoformat(),
    }
    _save(db, rec, cfg)

    return {"contact_id": contact_amo_id, "lead_id": lead_amo_id, "subdomain": cfg["subdomain"]}
