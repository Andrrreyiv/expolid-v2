"""Universal badge / QR / barcode parser endpoint (P0.2)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import schemas
from ..auth import get_current_user
from ..badge import parse_payload
from ..models import User

router = APIRouter(prefix="/api/badge", tags=["badge"])


@router.post("/parse", response_model=schemas.BadgeParseResponse)
def parse(
    payload: schemas.BadgeParseRequest,
    user: User = Depends(get_current_user),
):
    """Парсит произвольный QR/barcode/URL/vCard. Не сохраняет — только возвращает поля."""
    parsed = parse_payload(payload.payload)
    return schemas.BadgeParseResponse(
        name=parsed.get("name"),
        contact_company=parsed.get("contact_company"),
        role_title=parsed.get("role_title"),
        phone=parsed.get("phone"),
        email=parsed.get("email"),
        website=parsed.get("website"),
        telegram=parsed.get("telegram"),
        badge_id=parsed.get("badge_id"),
        capture_source=parsed.get("capture_source", "unknown"),
        raw_payload=parsed.get("raw_payload", payload.payload),
    )
