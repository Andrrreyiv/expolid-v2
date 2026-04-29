"""File upload endpoint.

Stores files on the local filesystem (Fly volume at /data/uploads in prod, ./uploads in dev).
Files are then served as static assets at /uploads/<filename>.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


def _upload_dir() -> Path:
    base = Path("/data/uploads") if os.path.isdir("/data") else Path("./uploads")
    base.mkdir(parents=True, exist_ok=True)
    return base


_ALLOWED_PREFIXES = ("image/", "audio/", "video/", "application/octet-stream")
_MAX_BYTES = 25 * 1024 * 1024  # 25 MB


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    if not file.content_type or not file.content_type.startswith(_ALLOWED_PREFIXES):
        raise HTTPException(status_code=415, detail=f"Unsupported content-type: {file.content_type}")

    contents = await file.read()
    if len(contents) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 25 MB)")

    suffix = Path(file.filename or "blob").suffix.lower()[:8]
    if not suffix:
        if "image" in (file.content_type or ""):
            suffix = ".jpg"
        elif "audio" in (file.content_type or ""):
            suffix = ".webm"
        else:
            suffix = ".bin"

    name = f"{uuid.uuid4().hex}{suffix}"
    path = _upload_dir() / name
    path.write_bytes(contents)

    return {
        "url": f"/uploads/{name}",
        "filename": name,
        "content_type": file.content_type or "application/octet-stream",
        "size": str(len(contents)),
    }
