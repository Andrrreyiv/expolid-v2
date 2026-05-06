"""HubSpot REST integration via Private App access token (P1.8).

User flow: Settings → Integrations → Private Apps → Create.
Scopes: crm.objects.contacts.write, crm.objects.deals.write, crm.objects.companies.write.

API docs: https://developers.hubspot.com/docs/api/crm/contacts
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
PROVIDER = "hubspot"
BASE_URL = "https://api.hubapi.com"


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


def upsert_token(db: Session, company_id: str, access_token: str) -> CompanyIntegration:
    if not access_token:
        raise ValueError("access_token обязателен")
    rec = get_integration(db, company_id)
    cfg = {"access_token": access_token}
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


def _client(rec: CompanyIntegration) -> httpx.Client:
    cfg = _config(rec)
    return httpx.Client(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {cfg.get('access_token', '')}"},
        timeout=20.0,
    )


def health(db: Session, company_id: str) -> dict[str, Any]:
    rec = get_integration(db, company_id)
    if not rec or not rec.is_enabled:
        return {"connected": False}
    try:
        with _client(rec) as cl:
            r = cl.get("/account-info/v3/details")
            if r.status_code != 200:
                return {"connected": False, "error": f"HTTP {r.status_code}"}
            d = r.json()
            return {"connected": True, "portal_id": d.get("portalId")}
    except httpx.HTTPError as e:
        return {"connected": False, "error": str(e)}


def _split_name(full_name: str | None) -> tuple[str, str]:
    if not full_name:
        return "", ""
    parts = full_name.strip().split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def push_contact(db: Session, company_id: str, contact: Contact) -> dict[str, Any]:
    rec = get_integration(db, company_id)
    if not rec or not rec.is_enabled:
        raise RuntimeError("HubSpot не подключён")

    first, last = _split_name(contact.name)
    properties: dict[str, Any] = {
        "firstname": first,
        "lastname": last or "—",
    }
    if contact.email:
        properties["email"] = contact.email
    if contact.phone:
        properties["phone"] = contact.phone
    if contact.contact_company:
        properties["company"] = contact.contact_company
    if contact.role_title:
        properties["jobtitle"] = contact.role_title
    if contact.website:
        properties["website"] = contact.website

    contact_id = None
    deal_id = None
    with _client(rec) as cl:
        # Try upsert by email
        if contact.email:
            r_search = cl.post(
                "/crm/v3/objects/contacts/search",
                json={
                    "filterGroups": [
                        {"filters": [{"propertyName": "email", "operator": "EQ", "value": contact.email}]}
                    ],
                    "limit": 1,
                },
            )
            if r_search.status_code == 200:
                results = (r_search.json().get("results") or [])
                if results:
                    contact_id = results[0].get("id")

        if contact_id:
            cl.patch(
                f"/crm/v3/objects/contacts/{contact_id}",
                json={"properties": properties},
            ).raise_for_status()
        else:
            r = cl.post(
                "/crm/v3/objects/contacts",
                json={"properties": properties},
            )
            r.raise_for_status()
            contact_id = r.json().get("id")

        # Создаём deal
        dprops = {
            "dealname": f"{contact.contact_company or contact.name or 'Lead'} — {contact.status}",
            "dealstage": "appointmentscheduled",
            "pipeline": "default",
        }
        r_deal = cl.post("/crm/v3/objects/deals", json={"properties": dprops})
        if r_deal.status_code in (200, 201):
            deal_id = r_deal.json().get("id")
            # Associate
            if contact_id:
                try:
                    cl.put(
                        f"/crm/v4/objects/deals/{deal_id}/associations/default/contacts/{contact_id}",
                    )
                except httpx.HTTPError:
                    pass

        # Note
        note_parts = []
        if contact.summary:
            note_parts.append(f"Summary: {contact.summary}")
        if contact.agreements:
            note_parts.append(f"Agreements: {contact.agreements}")
        if contact.next_step:
            note_parts.append(f"Next step: {contact.next_step}")
        if contact_id and note_parts:
            try:
                cl.post(
                    "/crm/v3/objects/notes",
                    json={
                        "properties": {
                            "hs_note_body": "\n".join(note_parts),
                            "hs_timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
                        },
                        "associations": [
                            {
                                "to": {"id": contact_id},
                                "types": [{"associationCategory": "HUBSPOT_DEFINED",
                                           "associationTypeId": 202}],
                            }
                        ],
                    },
                )
            except httpx.HTTPError:
                pass

    return {"contact_id": contact_id, "deal_id": deal_id}
