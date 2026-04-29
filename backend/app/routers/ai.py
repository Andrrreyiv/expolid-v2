"""AI endpoints (open-source, no external API).

OCR runs client-side (tesseract.js WASM) so the only server-side AI feature is
extractive text summarization, used for voice-memo transcripts and free-text
notes about an exhibition lead.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.ai.summarize import summarize as run_summary
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SummarizeIn(BaseModel):
    text: str


class SummarizeOut(BaseModel):
    summary: str
    phrases: list[str]


@router.post("/summarize", response_model=SummarizeOut)
async def summarize(
    payload: SummarizeIn,
    _: User = Depends(get_current_user),
) -> SummarizeOut:
    out = run_summary(payload.text)
    return SummarizeOut(**out)
