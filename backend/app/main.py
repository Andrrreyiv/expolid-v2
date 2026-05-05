from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from sqlalchemy import inspect, text

from .db import Base, engine
from .routers import (
    auth_routes,
    contacts_routes,
    dashboard_routes,
    events_routes,
    exhibitions_routes,
    push_routes,
    telegram_routes,
    integrations_routes,
    export_routes,
    followups_routes,
    tasks_routes,
    team_routes,
)

settings = get_settings()


def _migrate_add_columns() -> None:
    """Lightweight schema migrator for SQLite: add columns that exist on models but not in DB."""
    insp = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing_cols = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing_cols:
                continue
            col_type = col.type.compile(engine.dialect)
            null = "" if col.nullable else " NOT NULL"
            default = ""
            if col.default is not None and getattr(col.default, "is_scalar", False):
                val = col.default.arg
                if isinstance(val, bool):
                    val = 1 if val else 0
                if isinstance(val, str):
                    default = f" DEFAULT '{val}'"
                else:
                    default = f" DEFAULT {val}"
            with engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {col.name} {col_type}{null}{default}'))


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()
    from .telegram_bot import start_bot, stop_bot
    try:
        await start_bot()
    except Exception as e:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning("telegram bot start failed: %s", e)
    try:
        yield
    finally:
        try:
            await stop_bot()
        except Exception:  # noqa: BLE001
            pass


app = FastAPI(title="ЭкспоЛид API", version="2.0.0", lifespan=lifespan)

origins = (
    [o.strip() for o in settings.cors_origins.split(",")]
    if settings.cors_origins != "*"
    else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(exhibitions_routes.router)
app.include_router(contacts_routes.router)
app.include_router(tasks_routes.router)
app.include_router(followups_routes.router)
app.include_router(team_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(export_routes.router)
app.include_router(events_routes.router)
app.include_router(push_routes.router)
app.include_router(telegram_routes.router)
app.include_router(integrations_routes.router)


@app.get("/api/health")
def health():
    from . import ai

    return {
        "status": "ok",
        "ai_enabled": ai.is_enabled(),
        "ai_providers": ai.providers(),
        "app": settings.app_name,
    }


# Serve uploaded media (read-only)
upload_dir = Path(settings.upload_dir)
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")
