from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ExpoLid Backend"
    debug: bool = False

    # Database — sqlite+aiosqlite for dev, postgres+asyncpg for prod
    database_url: str = "sqlite+aiosqlite:///./expolid.db"

    # JWT
    jwt_secret: str = Field(default="change-me-in-prod-very-long-random-string-2026")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 30  # 30 days

    # CORS
    cors_origins: List[str] = ["*"]

    # OpenAI (optional — features degrade gracefully when absent)
    openai_api_key: str | None = None

    # Telegram Bot (optional)
    telegram_bot_token: str | None = None

    # VAPID (Web Push) — generated lazily on first use if missing
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str = "mailto:admin@expolid.app"


@lru_cache
def get_settings() -> Settings:
    return Settings()
