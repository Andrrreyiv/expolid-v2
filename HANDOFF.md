# ЭкспоЛид v2 — handoff для работы с другого компьютера / другого Claude Code

Этот документ даёт любому новому агенту (Claude Code, Cursor, Devin, самостоятельная разработка) всё, что нужно, чтобы продолжить работу с проектом без моей помощи.

---

## 1. Где что лежит

| Артефакт | URL / путь |
|---|---|
| Репозиторий | https://github.com/Andrrreyiv/expolid-v2 |
| Активная ветка | `devin/1777442052-pack0-scaffold` |
| Открытый PR | https://github.com/Andrrreyiv/expolid-v2/pull/1 |
| Frontend (прод) | https://dist-gwmheoxs.devinapps.com |
| Backend (прод) | https://expolid-backend-caxxvjvk.fly.dev |
| Telegram-бот | https://t.me/Expolead_bot |
| Тестовый логин | `smoke@test.com` / `smoke12345` |

Всё жёстко в репо. Ничего «только на моей машине» нет.

---

## 2. Клонирование и первый запуск

### 2.1 Предварительные требования
- Python 3.11+
- Node.js 20+ и `pnpm` 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- `uv` (`pip install uv` или `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Git

### 2.2 Клонируйте репозиторий
```bash
git clone https://github.com/Andrrreyiv/expolid-v2.git
cd expolid-v2
git checkout devin/1777442052-pack0-scaffold
```

### 2.3 Backend (локально, порт 8001)
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8001
```

Смоук: `curl http://localhost:8001/api/health` → `{"ok": true}`

### 2.4 Frontend (локально, порт 5173)
```bash
cd frontend
pnpm install
pnpm dev
```

Откройте http://localhost:5173. Vite-прокси пробрасывает `/api/*` на `http://localhost:8001`.

### 2.5 Создать первый аккаунт
Через UI: «Нет аккаунта? Зарегистрироваться» → любые данные → вы попадёте на дашборд и сможете добавить выставку / записать контакт.

---

## 3. Секреты (нужны только для прод-деплоя и Telegram-бота)

Всё, что нужно для локальной разработки, работает **без секретов**. Секреты нужны только чтобы деплоить или запускать бот.

| Секрет | Где используется | Как получить |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | FastAPI backend, runtime | [@BotFather](https://t.me/BotFather) → /newbot → или `/revoke` для текущего @Expolead_bot |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push | `uv run python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key.to_string().hex()); print(v.private_key.to_string().hex())"` или новый `openssl ecparam -genkey -name prime256v1` |
| `SECRET_KEY` | JWT-подпись | любой >32 байт, напр. `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DATABASE_URL` | SQLAlchemy | dev: `sqlite:///./app.db`; prod: `sqlite:////data/app.db` (Fly volume) или PostgreSQL |
| `CORS_ORIGINS` | FastAPI | CSV: `https://your-frontend.com,http://localhost:5173` |
| `FLY_API_TOKEN` | `flyctl deploy` | `flyctl auth login` → `flyctl auth token` (если хотите деплоить бекенд) |
| GitHub PAT | push в репо | https://github.com/settings/tokens — scopes `repo`, `workflow` |

Backend читает секреты из **env-переменных** (`backend/app/config.py`, Pydantic BaseSettings). В локальной разработке их можно положить в `backend/.env`.

**Тело текущего прод-env на Fly:**
```
TELEGRAM_BOT_TOKEN=<от BotFather>
VAPID_PUBLIC_KEY=<64 hex>
VAPID_PRIVATE_KEY=<hex>
VAPID_CONTACT_EMAIL=admin@raia.pro
SECRET_KEY=<token_urlsafe(64)>
DATABASE_URL=sqlite:////data/app.db
CORS_ORIGINS=https://dist-gwmheoxs.devinapps.com,http://localhost:5173
```

---

## 4. Как задеплоить изменения

### 4.1 Backend (Fly.io)
```bash
cd backend
flyctl auth login          # один раз
flyctl deploy --app expolid-backend-caxxvjvk
```

Машина уже настроена (volume `/data`, регион `sjc`, autoscale до нуля). После деплоя SSE-поток и Telegram-polling запустятся сами через FastAPI lifespan.

Посмотреть логи: `flyctl logs --app expolid-backend-caxxvjvk`.

Установить env-переменную:
```bash
flyctl secrets set TELEGRAM_BOT_TOKEN=... --app expolid-backend-caxxvjvk
```

### 4.2 Frontend (статический хостинг)
```bash
cd frontend
# ВАЖНО: правильный VITE_API_BASE_URL должен быть в .env.production
cat .env.production   # должно быть: VITE_API_BASE_URL=https://expolid-backend-caxxvjvk.fly.dev
pnpm build
# Залить папку dist/ на любой статический хост: Netlify, Cloudflare Pages, S3, GitHub Pages...
# Текущий деплой идёт через devinapps.com — любой replacement OK
```

Если меняете URL бекенда — пересоберите фронт с новым `VITE_API_BASE_URL` (Vite вшивает его в бандл на этапе сборки; runtime-подмена не работает).

---

## 5. Архитектура в двух экранах

### 5.1 Backend
```
backend/app/
├── main.py                FastAPI app, CORS, lifespan (запускает SSE+telegram_bot)
├── config.py              Pydantic BaseSettings (читает env)
├── database.py            async engine + session factory
├── models.py              SQLAlchemy 2.0 ORM: User, Org, Exhibition, Contact,
│                           Task, FollowUp, Template, TeamMember, PushSubscription,
│                           TelegramLink
├── schemas.py             Pydantic DTO in/out
├── security.py            JWT, passlib
├── deps.py                get_db / get_current_user / require_role
├── events.py              in-memory asyncio pub-sub для SSE
├── push.py                pywebpush обёртка
├── telegram_bot.py        long-polling бот (фоновая задача)
└── routers/
    ├── auth.py            /register /login /me
    ├── exhibitions.py     CRUD + /active
    ├── contacts.py        CRUD + поиск + assignee_id
    ├── tasks.py           CRUD + assignee_id + per-row PATCH
    ├── followups.py       CRUD + /send-mark
    ├── templates.py       CRUD шаблонов
    ├── team.py            приглашения + изменение ролей
    ├── dashboard.py       /stats (KPI + avg-followup)
    ├── exports.py         /exports/contacts.xlsx (25 колонок, openpyxl)
    ├── uploads.py         multipart → /data/uploads/<uuid>.ext
    ├── stream.py          /stream SSE с JWT в query
    ├── push.py            /push/subscribe, VAPID
    ├── telegram.py        /telegram/pair (генерация pairing code)
    └── ai.py              /ai/summarize (экстрактивный), /ai/ocr (заглушка для VLM)
```

База: SQLite в `/data/app.db`, миграции идут через `Base.metadata.create_all` в lifespan. Для продовой миграции рекомендую перейти на Alembic, если будут реальные пользователи.

### 5.2 Frontend
```
frontend/src/
├── api/index.ts           axios + все REST-функции
├── store/auth.ts          zustand + localStorage
├── lib/
│   ├── ocr.ts             Tesseract.js + парсеры
│   ├── summarize.ts       вызов /ai/summarize
│   ├── offlineQueue.ts    Dexie/IndexedDB + sync
│   └── stream.ts          EventSource + auto-reconnect
├── components/
│   ├── Layout.tsx         5-tab nav с круглой FAB
│   ├── VoiceRecorder.tsx  MediaRecorder + Web Speech API
│   ├── QRScan.tsx         jsQR
│   ├── TasksSection.tsx
│   ├── FollowUpSection.tsx
│   ├── TemplatesSection.tsx
│   └── TeamSection.tsx
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── HomePage.tsx       дашборд с KPI
│   ├── CapturePage.tsx    3-шаговый wizard
│   ├── ContactsPage.tsx
│   ├── ContactDetailPage.tsx
│   ├── TasksPage.tsx
│   └── SettingsPage.tsx
├── App.tsx                роуты
└── main.tsx
```

PWA: `vite-plugin-pwa` с `injectManifest`, service worker → `src/sw.ts`.

---

## 6. Текущее состояние фич (честно)

### Работает сейчас
- Полный CRUD контактов/задач/выставок/шаблонов
- Capture flow с OCR (Tesseract.js) + QR (jsQR) + голос + автосаммари `[Резюме]`
- 4 follow-up сценария (Письмо / КП / Приглашение / Скрипт) с переменными
- UI-редактор шаблонов (создать/переименовать/удалить/сделать default)
- Команда + роли + приглашения с одноразовым паролем
- KPI-дашборд с avg-followup-hours
- Excel-экспорт 25 колонок (включая AI-скор/Связь/Менеджер/Кто записал)
- PWA + iOS/Android install
- Offline IndexedDB с авто-sync
- SSE real-time + Web Push (VAPID)
- Telegram-бот @Expolead_bot
- Подпись «Made by Raia.pro» на главной + в `/start` бота

### Не работает без ключа AI-провайдера
- VLM-OCR для рукописных визиток (нужен GPT-4o Vision / Claude / Yandex GPT)
- Whisper-качество расшифровки голоса (сейчас Web Speech API → только Chrome/Edge/Safari)
- AI-резюме встречи своими словами (сейчас экстрактивный алгоритм)
- Авто-договорённости и авто-следующий-шаг с автозадачей
- AI-скоринг 1–100 с причиной
- AI-генерация писем/КП/приглашений/скриптов
- Адаптация шаблонов под контакт

Заглушки для этих фич уже стоят в `backend/app/routers/ai.py` — добавить адаптер OpenAI/Anthropic/Yandex не сложнее, чем один `httpx.post` + `env` переменная.

### Известные ограничения
- Хостинг в SJC (США) — для 152-ФЗ надо перенести на Selectel / Yandex Cloud / свой сервер (код от смены хостинга не зависит)
- SQLite один файл — при росте команды >20 человек имеет смысл перенести на PostgreSQL (изменить только `DATABASE_URL`)
- Fly.io free-tier засыпает через 5 минут — Telegram long-polling в этот момент замолкает; чинится `min_machines_running=1` в `fly.toml`

---

## 7. Типовые задачи для следующего агента

### «Добавь новое поле в контакт»
1. `backend/app/models.py` — колонка
2. `backend/app/schemas.py` — `ContactIn` / `ContactUpdate` / `ContactOut`
3. `backend/app/routers/contacts.py` — проверить, что и `create_contact`, и `update_contact` принимают его
4. `frontend/src/api/index.ts` — тип `Contact` + опциональное поле в `create/update`
5. `frontend/src/pages/CapturePage.tsx` и `ContactDetailPage.tsx` — input
6. `backend/app/routers/exports.py` → `COLUMNS` — новая колонка в Excel

### «Подключи реальный AI-ключ»
1. `backend/pyproject.toml` — `openai` (или `anthropic`, или ваш провайдер)
2. `backend/app/ai/llm.py` — новый модуль: единая функция `async def complete(system, user, model="...") -> str`
3. `backend/app/routers/ai.py` — замените stub в `/ai/summarize` и добавьте `/ai/ocr`, `/ai/score`, `/ai/generate-email`
4. `flyctl secrets set OPENAI_API_KEY=... --app expolid-backend-caxxvjvk`
5. Frontend `lib/ocr.ts` — fallback: сначала VLM, если ключа нет или ошибка → Tesseract

### «Перевези хостинг в РФ»
1. Возьмите VPS у Selectel / Yandex Cloud / Beget
2. `docker build -t expolid-backend ./backend` (Dockerfile уже есть)
3. `docker run -p 8000:8000 -v /data:/data --env-file .env expolid-backend`
4. Поменяйте `VITE_API_BASE_URL` в `frontend/.env.production` → `pnpm build`
5. Залейте `dist/` на тот же VPS (nginx + certbot) или на Cloudflare Pages

---

## 8. Как взять этот проект в Claude Code

В Claude Code (или любом другом агент-клиенте):

1. Склонируйте репо (см. §2.2)
2. Откройте папку `expolid-v2/` как workspace
3. Дайте агенту этот `HANDOFF.md` как первый контекст:
   ```
   Прочитай HANDOFF.md в корне проекта. Это действующее приложение.
   Запусти его локально (см. §2.3 и §2.4) и подтверди, что /api/health отвечает.
   Затем вот задача: <ваша задача>
   ```
4. Если собираетесь деплоить — дайте агенту секреты через `.env` файлы, а не в чат
5. Всегда работайте через PR в ветку `devin/1777442052-pack0-scaffold` (или создавайте новые фичевые ветки от неё)

### Что стоит дать агенту сразу (если вы хотите полноценный прод-доступ)
- `TELEGRAM_BOT_TOKEN` — чтобы бот работал с новой машины
- `FLY_API_TOKEN` — чтобы мог деплоить backend
- GitHub Personal Access Token — чтобы мог пушить и открывать PR

Все три — необязательны для разработки. Только для деплоя / бота.

---

## 9. Контрольный чек-лист handoff

Перед тем как передать проект на другую машину, проверьте:

- [ ] `git clone ... && git checkout devin/1777442052-pack0-scaffold` работает
- [ ] `cd backend && uv sync && uv run uvicorn app.main:app --port 8001` запускается без ошибок
- [ ] `curl http://localhost:8001/api/health` → `{"ok": true}`
- [ ] `cd frontend && pnpm install && pnpm dev` запускается, http://localhost:5173 открывает форму логина
- [ ] Регистрация нового юзера через UI работает (ни 405, ни 500)
- [ ] Прод-frontend `https://dist-gwmheoxs.devinapps.com` всё ещё живой и отвечает
- [ ] Прод-backend `https://expolid-backend-caxxvjvk.fly.dev/api/health` отвечает 200
- [ ] У вас на руках секреты (см. §3) — хотя бы `TELEGRAM_BOT_TOKEN` на случай, если захотите перевыпустить бот на новой учётке

Если всё галочки — новый агент может работать с проектом как будто сам его писал.
