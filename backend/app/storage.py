import uuid
from pathlib import Path
from typing import IO

from .config import get_settings

settings = get_settings()


def save_upload(file: IO[bytes], original_name: str | None = None) -> tuple[str, str]:
    """Save uploaded file to local upload dir. Returns (relative_path, absolute_path)."""
    base = settings.upload_path
    ext = ""
    if original_name and "." in original_name:
        ext = "." + original_name.rsplit(".", 1)[1].lower()[:6]
    fname = f"{uuid.uuid4().hex}{ext}"
    dest = base / fname
    with open(dest, "wb") as out:
        while chunk := file.read(1024 * 1024):
            out.write(chunk)
    return fname, str(dest)


def absolute(rel: str) -> Path:
    return settings.upload_path / rel


def delete_upload(rel: str) -> bool:
    """Удаляет файл из upload-каталога. True если удалили, False иначе."""
    if not rel:
        return False
    try:
        p = settings.upload_path / rel
        if p.exists() and p.is_file():
            p.unlink()
            return True
    except Exception:  # noqa: BLE001
        pass
    return False
