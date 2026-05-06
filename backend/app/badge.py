"""Universal badge / business card payload parser (P0.2).

Поддерживает:
  - vCard (BEGIN:VCARD ... END:VCARD)
  - MECARD: (старый Японский стандарт, до сих пор используется)
  - URL — пытаемся достать query-params name/email/phone, либо отдаём как website
  - mailto:, tel:, sms: — извлекаем email/phone
  - произвольная строка штрихкода (Code128/EAN13) — отдаём как badge_id

Не делает HTTP-запросов; парсинг локальный.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


def _parse_vcard(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {"capture_source": "vcard"}
    for raw in text.replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line or ":" not in line:
            continue
        key, val = line.split(":", 1)
        key_main = key.split(";", 1)[0].upper()
        val = val.strip()
        if not val:
            continue
        if key_main == "FN" and not out.get("name"):
            out["name"] = val
        elif key_main == "N" and not out.get("name"):
            # N:Surname;Given;...
            parts = [p for p in val.split(";") if p]
            if parts:
                out["name"] = " ".join([parts[1] if len(parts) > 1 else "", parts[0]]).strip()
        elif key_main == "ORG":
            out["contact_company"] = val.split(";")[0]
        elif key_main == "TITLE":
            out["role_title"] = val
        elif key_main == "EMAIL":
            out.setdefault("email", val)
        elif key_main == "TEL":
            out.setdefault("phone", val)
        elif key_main == "URL":
            out.setdefault("website", val)
        elif key_main == "X-TELEGRAM":
            out["telegram"] = val
    return out


def _parse_mecard(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {"capture_source": "mecard"}
    body = text[len("MECARD:"):] if text.upper().startswith("MECARD:") else text
    # MECARD fields are separated by ;
    for chunk in body.split(";"):
        if ":" not in chunk:
            continue
        k, v = chunk.split(":", 1)
        k = k.upper().strip()
        v = v.strip()
        if not v:
            continue
        if k == "N" and not out.get("name"):
            parts = [p for p in v.split(",") if p]
            out["name"] = " ".join(reversed(parts)).strip()
        elif k == "ORG":
            out["contact_company"] = v
        elif k == "EMAIL":
            out.setdefault("email", v)
        elif k == "TEL":
            out.setdefault("phone", v)
        elif k == "URL":
            out.setdefault("website", v)
        elif k == "TITLE":
            out["role_title"] = v
    return out


def _parse_url(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {"capture_source": "url", "website": text}
    try:
        parsed = urlparse(text)
        params = parse_qs(parsed.query or "")
        # Try common badge URL patterns
        # ExpoCenter / Crocus / Messe иногда дают ?id=12345&name=...
        for key, val in params.items():
            v = unquote(val[0]) if val else ""
            kl = key.lower()
            if kl in ("name", "fullname", "fn", "displayname"):
                out.setdefault("name", v)
            elif kl in ("email", "mail"):
                out.setdefault("email", v)
            elif kl in ("phone", "tel", "mobile"):
                out.setdefault("phone", v)
            elif kl in ("company", "org", "organization"):
                out.setdefault("contact_company", v)
            elif kl in ("title", "role", "position"):
                out.setdefault("role_title", v)
            elif kl in ("id", "badgeid", "badge_id"):
                out.setdefault("badge_id", v)
        # Если в path есть UUID/число — это, вероятно, badge_id
        if not out.get("badge_id"):
            m = re.search(r"/([0-9a-zA-Z][0-9a-zA-Z-]{3,})/?$", parsed.path or "")
            if m:
                out["badge_id"] = m.group(1)
    except Exception:  # noqa: BLE001
        pass
    return out


def parse_payload(payload: str) -> dict[str, Any]:
    """Главная точка входа. Возвращает dict с полями контакта + capture_source/badge_id/raw_payload."""
    text = (payload or "").strip()
    if not text:
        return {"capture_source": "unknown", "raw_payload": ""}

    upper = text.upper()
    if upper.startswith("BEGIN:VCARD"):
        out = _parse_vcard(text)
    elif upper.startswith("MECARD:"):
        out = _parse_mecard(text)
    elif text.lower().startswith("mailto:"):
        out = {"capture_source": "mailto", "email": text[len("mailto:"):].split("?", 1)[0]}
    elif text.lower().startswith(("tel:", "sms:")):
        out = {"capture_source": "tel", "phone": text.split(":", 1)[1].split("?", 1)[0]}
    elif re.match(r"^https?://", text, re.IGNORECASE):
        out = _parse_url(text)
    elif re.match(r"^[A-Z0-9\-_]{6,}$", text):
        # Похоже на штрихкод/RFID-код
        out = {"capture_source": "barcode", "badge_id": text}
    elif "@" in text and "." in text and " " not in text:
        out = {"capture_source": "email", "email": text}
    else:
        out = {"capture_source": "unknown", "badge_id": text[:255]}
    out.setdefault("raw_payload", text)
    return out
