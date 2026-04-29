# ЭкспоЛид v2

> Захват контактов на выставках с AI: фото визитки + голос + резюме встречи + автозадачи + персонализированный follow-up.

Состоит из двух приложений:

- **`backend/`** — FastAPI + SQLAlchemy (SQLite в dev, PostgreSQL в prod), JWT-auth.
- **`frontend/`** — React + Vite + TypeScript + Tailwind, мобильно-ориентированный UI с нижней tab-bar навигацией.

## Структура

```
expolid-v2/
├── backend/                 FastAPI: модели, auth, REST-API
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── security.py
│   │   ├── deps.py
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── exhibitions.py
│   │       └── contacts.py
│   └── pyproject.toml       (uv)
└── frontend/                React + Vite + TS + Tailwind
    ├── src/
    │   ├── api/             axios клиент + REST-функции
    │   ├── store/           zustand auth-store
    │   ├── pages/           роуты (Home, Contacts, Tasks, Settings, ...)
    │   ├── components/
    │   └── App.tsx
    └── package.json
```

## Запуск локально

```bash
# Backend (порт 8001)
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8001

# Frontend (порт 5173, прокси /api → :8001)
cd frontend
pnpm install
pnpm dev
```

Смоук-тест:

```bash
curl http://localhost:8001/api/health
```

## Roadmap

- [x] **Пакет 0** — auth (JWT), модели, выставки, контакты (минимальный CRUD).
- [ ] **Пакет 1** — capture flow (фото визитки + фото человека + голос + QR + заметки).
- [ ] **Пакет 2** — задачи, 4-сценарный follow-up + персонализация, мульти-контакт, шаблоны.
- [ ] **Пакет 3** — команда + роли, дашборд KPI, Excel-экспорт (22 колонки).
- [ ] **Пакет 4** — PWA + IndexedDB offline-first + sync queue.
- [ ] **Пакет 5** — SSE real-time + Web Push (VAPID).
- [ ] **Пакет 6** — AI-модуль (OpenAI Whisper + GPT-4o vision + chat).
- [ ] **Пакет 7** — Telegram-бот.
- [ ] **Пакет 8** — amoCRM OAuth.

## Лицензия

MIT
