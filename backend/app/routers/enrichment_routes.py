"""Contact enrichment endpoint (P1.6)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user
from ..db import get_db
from ..enrichment import enrich_contact
from ..models import Contact, User

router = APIRouter(prefix="/api/contacts", tags=["enrichment"])


@router.post("/{contact_id}/enrich", response_model=schemas.ContactOut)
async def enrich(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Contact).filter(Contact.id == contact_id).first()
    if not c or c.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Контакт не найден")
    data = await enrich_contact(
        contact_company=c.contact_company,
        email=c.email,
        website=c.website,
    )
    if data:
        # Auto-fill basic fields if empty
        if not c.contact_company and data.get("short_name"):
            c.contact_company = data["short_name"]
        if not c.website and data.get("website_title"):
            # don't override website with title — only if had domain anyway
            pass
        c.enrichment_data = data
        c.enriched_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(c)
    return c
