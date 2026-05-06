"""Contact enrichment for Russian market (P1.6).

Sources (приоритет):
  1. DaData.ru — поиск компаний по названию/email-домену/ИНН (10k бесплатно/день)
  2. ФНС / EGRUL открытые данные (fallback, не требует ключа)
  3. Website meta-tags scrape (title, description, keywords)
  4. Telegram username verify (по @username)

Никаких LinkedIn/иностранных enrichment — в РФ-рынке нерелевантно.

Все вызовы time-boxed (5s каждый), результаты кладутся в Contact.enrichment_data.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

import httpx

from .config import get_settings

log = logging.getLogger(__name__)


def _domain_from_email(email: Optional[str]) -> Optional[str]:
    if not email or "@" not in email:
        return None
    return email.split("@", 1)[1].strip().lower()


def _domain_from_website(website: Optional[str]) -> Optional[str]:
    if not website:
        return None
    s = website.strip().lower()
    s = re.sub(r"^https?://", "", s)
    s = s.split("/", 1)[0]
    s = s.lstrip("www.")
    return s or None


async def _dadata_party(query: str) -> dict[str, Any]:
    """Поиск юр.лица в DaData по названию или ИНН."""
    settings = get_settings()
    api_key = getattr(settings, "dadata_api_key", None) or ""
    if not api_key:
        return {}
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    url = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(url, json={"query": query, "count": 1}, headers=headers)
            if r.status_code != 200:
                return {}
            data = r.json()
            sug = (data.get("suggestions") or [None])[0]
            if not sug:
                return {}
            d = sug.get("data") or {}
            mgmt = d.get("management") or {}
            return {
                "inn": d.get("inn"),
                "ogrn": d.get("ogrn"),
                "full_name": (d.get("name") or {}).get("full_with_opf"),
                "short_name": (d.get("name") or {}).get("short_with_opf"),
                "address": (d.get("address") or {}).get("unrestricted_value"),
                "okved": d.get("okved"),
                "okved_text": (d.get("okveds") or [{}])[0].get("name") if d.get("okveds") else None,
                "head_name": mgmt.get("name"),
                "head_role": mgmt.get("post"),
                "is_active": d.get("state", {}).get("status") == "ACTIVE",
            }
    except Exception as e:  # noqa: BLE001
        log.warning("dadata_party failed: %s", e)
        return {}


async def _website_meta(domain: str) -> dict[str, Any]:
    """Достаём title/description/keywords из <head>."""
    if not domain:
        return {}
    url = f"https://{domain}"
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "ExpoLid/2.0 (+https://expolid.app)"})
            if r.status_code >= 400:
                return {}
            html = r.text[:50_000]  # head обычно в первых 50 KB
            out: dict[str, Any] = {}
            m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
            if m:
                out["website_title"] = re.sub(r"\s+", " ", m.group(1)).strip()[:255]
            m = re.search(
                r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
                html, re.IGNORECASE,
            )
            if m:
                out["website_description"] = m.group(1).strip()[:500]
            m = re.search(
                r'<meta[^>]+name=["\']keywords["\'][^>]+content=["\']([^"\']+)["\']',
                html, re.IGNORECASE,
            )
            if m:
                out["website_keywords"] = m.group(1).strip()[:500]
            return out
    except Exception as e:  # noqa: BLE001
        log.warning("website_meta failed for %s: %s", domain, e)
        return {}


async def enrich_contact(
    *,
    contact_company: Optional[str] = None,
    email: Optional[str] = None,
    website: Optional[str] = None,
    inn: Optional[str] = None,
) -> dict[str, Any]:
    """Главная функция обогащения. Возвращает dict, готовый для Contact.enrichment_data."""
    out: dict[str, Any] = {"sources": []}

    # 1. DaData по ИНН либо по названию компании
    party_query = inn or contact_company
    if party_query:
        party = await _dadata_party(party_query)
        if party:
            out.update({k: v for k, v in party.items() if v is not None})
            out["sources"].append("dadata")

    # 2. Если нашли email-домен — пробуем по нему DaData
    domain = _domain_from_website(website) or _domain_from_email(email)
    if not out.get("inn") and domain:
        party = await _dadata_party(domain)
        if party:
            out.update({k: v for k, v in party.items() if v is not None and not out.get(k)})
            if "dadata" not in out["sources"]:
                out["sources"].append("dadata")

    # 3. Website meta-tags
    if domain:
        meta = await _website_meta(domain)
        if meta:
            out.update(meta)
            out["sources"].append("website_meta")

    return out
