from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ЭкспоЛид"
    environment: str = "development"
    secret_key: str = "change-me-in-production-please-1234567890"
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = (
        "sqlite:////data/app.db" if Path("/data").is_dir() and Path("/data").stat().st_uid == 0 and Path("/.dockerenv").exists()
        else "sqlite:///./data/expolid.db"
    )
    upload_dir: str = (
        "/data/uploads" if Path("/data").is_dir() and Path("/.dockerenv").exists()
        else "./data/uploads"
    )

    cors_origins: str = "*"

    openai_api_key: str = ""
    openai_model_chat: str = "gpt-4o"
    openai_model_vision: str = "gpt-4o"
    openai_model_audio: str = "whisper-1"

    # Google Gemini (free tier — vision OCR + chat)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Groq (free tier — Whisper STT)
    groq_api_key: str = ""
    groq_model_audio: str = "whisper-large-v3-turbo"

    # Web Push (VAPID)
    vapid_public_key: str = "BDdNjSHgm43kv_aCs7uZsLe7sCHuP5mWOwakaK2jFGBldOfXTJSU78eUCj6DOY6XIlly4koNyop-eSrkhz6dOL0"
    vapid_private_pem_b64: str = "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JR0hBZ0VBTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEJHMHdhd0lCQVFRZ2FQYVpYZStwamtLTmdGWFkKcjZsL056NVdpL21zK1J5RmRBL1ltZy9HWkxtaFJBTkNBQVEzVFkwaDRKdU41TC8yZ3JPN21iQzN1N0FoN2orWgpsanNHcEdpdG94UmdaWFRuMTB5VWxPL0hsQW8rZ3ptT2x5SlpjdUpLRGNxS2Zua3E1SWMrblRpOQotLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tCg=="
    vapid_subject: str = "mailto:noreply@expolid.app"

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()
