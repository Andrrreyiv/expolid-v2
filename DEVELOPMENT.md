# Разработка ЭкспоЛид

## Структура

```
expolid/
├── backend/         # FastAPI (Python 3.11+)
│   ├── app/
│   │   ├── routers/         # /api/* endpoints
│   │   ├── ai.py            # Gemini / Groq / OpenAI wrappers
│   │   ├── auth.py          # JWT + bcrypt
│   │   ├── config.py        # env config
│   │   ├── db.py            # SQLAlchemy session
│   │   ├── events.py        # SSE EventBus
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── push.py          # VAPID Web Push
│   │   ├── schemas.py       # Pydantic v2
│   │   ├── storage.py       # file uploads
│   │   ├── telegram_bot.py  # python-telegram-bot
│   │   └── integrations/
│   │       └── amocrm.py
│   ├── pyproject.toml
│   └── .env.example
└── frontend/        # React 18 + Vite
    ├── src/
    │   ├── pages/           # SignIn, SignUp, Home, Capture, Contacts, ContactDetail, Tasks, Export, Settings
    │   ├── lib/             # api, push, offline (IndexedDB sync queue), errmsg
    │   ├── api.ts
    │   └── App.tsx
    ├── public/
    │   ├── sw.js            # Service Worker (PWA + push handler)
    │   └── manifest.webmanifest
    └── package.json
```

## Локальная установка

### Требования
- Python 3.11+
- Node.js 20+
- (опц.) ключи Google Gemini, Groq

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

cp .env.example .env
# отредактируйте .env: вставьте свой SECRET_KEY (любая случайная строка),
# GEMINI_API_KEY, GROQ_API_KEY (если хотите AI-фичи)

mkdir -p data/uploads
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload
```

Backend отдаёт API на `http://localhost:8765/api/*`.
Health-чек: `curl http://localhost:8765/api/health`.

### Frontend

```bash
cd frontend
npm install

cp .env.example .env
# по умолчанию VITE_API_BASE_URL=http://localhost:8765 — этого достаточно для локалки

npm run dev
```

Открыть [http://localhost:5173](http://localhost:5173).

### Получить AI-ключи (бесплатно)

1. **Google Gemini** (vision + chat): [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API key. Бесплатно: 1500 запросов/день.
2. **Groq** (Whisper STT): [https://console.groq.com/keys](https://console.groq.com/keys) → Create. Бесплатно, без карты: 14k запросов/день.

Положить в `backend/.env`:
```
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=gsk_...
```

Без ключей приложение работает на 80% — все формы, экспорт, задачи, команда, follow-up по шаблонам, но без OCR/STT/AI-генерации.

## Деплой

### Backend → Fly.io

```bash
cd backend
fly launch --name expolid-backend-XXXX --region ams --no-deploy
fly volumes create data --size 1 --region ams
fly secrets set SECRET_KEY=... GEMINI_API_KEY=... GROQ_API_KEY=...
fly deploy
```

Backend будет доступен на `https://expolid-backend-XXXX.fly.dev`.

### Frontend → любая статика

```bash
cd frontend
echo "VITE_API_BASE_URL=https://expolid-backend-XXXX.fly.dev" > .env.production
npm run build
# dist/ — кладите на Vercel / Netlify / Cloudflare Pages / S3 / Devinapps / любой статический хостинг
```

## Тесты

В корне репозитория есть скрипт `audit.py` (скопируйте из истории сессий) — проверяет 60+ эндпоинтов на проде:

```bash
cd backend
source .venv/bin/activate
python /tmp/audit.py
```

## Архитектурные решения

- **JWT в localStorage** — приемлемо для приложения с короткими сессиями. Refresh token не реализован — токен живёт 7 дней (30 с remember-me).
- **SQLite + Fly volume** — простота. Для >100 пользователей переходить на PostgreSQL: `DATABASE_URL=postgresql://...`.
- **Multi-tenant** — `company_id` везде. `_ensure_visible()` проверяет принадлежность ресурса компании пользователя.
- **AI fallback** — `app/ai.py` пробует Gemini → OpenAI; Groq → OpenAI. Если все ключи отсутствуют, операция возвращает `None`/`{}`, никогда не падает.
- **Offline-first** — `frontend/src/lib/offline.ts` хранит pending captures в IndexedDB, при `online`-событии синхронизирует.
- **SSE** — `app/events.py` — простой in-memory EventBus, для масштаба нужен Redis pub/sub.
- **Service Worker** — `frontend/public/sw.js` v3 — навигации `cache: "no-store"` (всегда свежий HTML), хэшированные ассеты stale-while-revalidate.

## Безопасность

- Никогда не коммитить реальный `.env`
- `SECRET_KEY` обязательно случайный — `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `CORS_ORIGINS=*` пригоден только для разработки — в проде указывать конкретный домен фронтенда
- Загружаемые файлы валидируются по mime-type, но в проде поставить limit на размер (`StaticFiles` + nginx-level)
