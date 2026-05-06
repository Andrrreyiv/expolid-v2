"""AI helpers — multi-provider routing.

Provider preference (auto-fallback):
  - Audio (STT):   Groq Whisper-large-v3-turbo  →  OpenAI Whisper
  - Vision (OCR):  Google Gemini 1.5 Flash      →  OpenAI GPT-4o vision
  - Chat:          Google Gemini 1.5 Flash      →  OpenAI GPT-4o-mini

Free-tier first: Gemini (1500 req/day) + Groq (14k req/day) = $0/mo for typical use.
HTTP calls go through httpx — no heavy SDKs (keeps Fly.io 256MB happy).
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Optional

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _valid_openai_key() -> bool:
    """OpenAI keys begin with lowercase 'sk-'. The Codex CLI OAuth token starts
    with capital 'Sk-' and is not a valid API key — ignore it to avoid 401 spam."""
    k = settings.openai_api_key or ""
    return k.startswith(("sk-", "sk_"))


def _openai_key() -> str:
    return settings.openai_api_key if _valid_openai_key() else ""


# ---------- Capability detection ----------
def has_audio() -> bool:
    return bool(settings.groq_api_key or _openai_key())


def has_vision() -> bool:
    return bool(settings.gemini_api_key or _openai_key())


def has_chat() -> bool:
    return bool(settings.gemini_api_key or _openai_key())


def is_enabled() -> bool:
    """Backwards-compat — true if ANY provider is configured."""
    return has_chat() or has_vision() or has_audio()


def providers() -> dict[str, str]:
    """Return which provider is active for each capability."""
    return {
        "audio": "groq" if settings.groq_api_key else ("openai" if _openai_key() else "none"),
        "vision": "gemini" if settings.gemini_api_key else ("openai" if _openai_key() else "none"),
        "chat": "gemini" if settings.gemini_api_key else ("openai" if _openai_key() else "none"),
    }


# ---------- Helpers ----------
def _strip_json(text: str) -> str:
    """Strip markdown code fences, leading/trailing junk so json.loads works."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _data_mime(file_path: str) -> str:
    suffix = Path(file_path).suffix.lower().lstrip(".") or "jpeg"
    if suffix == "jpg":
        suffix = "jpeg"
    return f"image/{suffix}"


# =====================================================================
#                            AUDIO  (STT)
# =====================================================================
def transcribe_audio(file_path: str) -> Optional[str]:
    """Voice → text. Prefer Groq Whisper-large-v3-turbo, fallback OpenAI."""
    if settings.groq_api_key:
        try:
            return _groq_transcribe(file_path)
        except Exception as e:
            logger.warning("Groq STT failed, trying OpenAI: %s", e)
    if _openai_key():
        try:
            return _openai_transcribe(file_path)
        except Exception as e:
            logger.exception("OpenAI STT failed: %s", e)
    return None


def _groq_transcribe(file_path: str) -> Optional[str]:
    with open(file_path, "rb") as f:
        files = {"file": (Path(file_path).name, f, "audio/ogg")}
        data = {"model": settings.groq_model_audio, "language": "ru", "response_format": "json"}
        r = httpx.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            files=files,
            data=data,
            timeout=60.0,
        )
        r.raise_for_status()
        return (r.json().get("text") or "").strip() or None


def _openai_transcribe(file_path: str) -> Optional[str]:
    with open(file_path, "rb") as f:
        files = {"file": (Path(file_path).name, f, "audio/ogg")}
        data = {"model": settings.openai_model_audio, "language": "ru"}
        r = httpx.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {_openai_key()}"},
            files=files,
            data=data,
            timeout=60.0,
        )
        r.raise_for_status()
        return (r.json().get("text") or "").strip() or None


# =====================================================================
#                  VISION  (OCR business card)
# =====================================================================
CARD_OCR_PROMPT = """Ты помощник, который извлекает контактные данные с фотографии визитки.
Верни СТРОГО JSON со следующими полями (любое отсутствующее — null):
{
  "name": "ФИО",
  "contact_company": "название компании",
  "role_title": "должность",
  "phone": "+7 (XXX) XXX-XX-XX",
  "email": "...@...",
  "website": "https://...",
  "telegram": "@username или ссылка",
  "whatsapp": "номер или ссылка",
  "linkedin": "ссылка"
}
Если на визитке есть рукописные пометки — извлеки и их.
Если ничего не распознать — верни все null.
Отвечай ТОЛЬКО валидным JSON, без комментариев."""


def ocr_business_card(file_path: str) -> dict[str, Any]:
    if settings.gemini_api_key:
        try:
            return _gemini_vision_json(file_path, CARD_OCR_PROMPT, "Распознай эту визитку:")
        except Exception as e:
            logger.warning("Gemini OCR failed, trying OpenAI: %s", e)
    if _openai_key():
        try:
            return _openai_vision_json(file_path, CARD_OCR_PROMPT, "Распознай эту визитку:")
        except Exception as e:
            logger.exception("OpenAI OCR failed: %s", e)
    return {}


def _gemini_post_with_retry(body: dict[str, Any]) -> httpx.Response:
    """POST to Gemini generateContent with one retry on 429.

    Free tier limits to 20 RPM on gemini-2.5-flash; under bursts a single
    retry after the API-suggested delay covers most cases.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    headers = {"x-goog-api-key": settings.gemini_api_key, "content-type": "application/json"}
    r = httpx.post(url, headers=headers, json=body, timeout=60.0)
    if r.status_code != 429:
        return r
    # Try to honor server-suggested delay, capped to keep latency sane.
    delay = 5.0
    try:
        msg = r.json().get("error", {}).get("message", "")
        m = re.search(r"retry in ([0-9.]+)s", msg)
        if m:
            delay = min(float(m.group(1)) + 0.5, 15.0)
    except (ValueError, KeyError, AttributeError):
        pass
    time.sleep(delay)
    return httpx.post(url, headers=headers, json=body, timeout=60.0)


def _gemini_vision_json(file_path: str, system: str, user: str) -> dict[str, Any]:
    img_b64 = base64.b64encode(Path(file_path).read_bytes()).decode()
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{
            "role": "user",
            "parts": [
                {"text": user},
                {"inline_data": {"mime_type": _data_mime(file_path), "data": img_b64}},
            ],
        }],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    r = _gemini_post_with_retry(body)
    r.raise_for_status()
    data = r.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(_strip_json(text))


def _openai_vision_json(file_path: str, system: str, user: str) -> dict[str, Any]:
    suffix = Path(file_path).suffix.lower().lstrip(".") or "jpeg"
    if suffix == "jpg":
        suffix = "jpeg"
    data_url = f"data:image/{suffix};base64,{base64.b64encode(Path(file_path).read_bytes()).decode()}"
    body = {
        "model": settings.openai_model_vision,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": [
                {"type": "text", "text": user},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]},
        ],
        "max_tokens": 600,
    }
    r = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {_openai_key()}", "content-type": "application/json"},
        json=body,
        timeout=60.0,
    )
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"] or "{}")


# =====================================================================
#                            CHAT
# =====================================================================
def _gemini_chat_json(system: str, user: str) -> dict[str, Any]:
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"},
    }
    r = _gemini_post_with_retry(body)
    r.raise_for_status()
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(_strip_json(text))


def _openai_chat_json(system: str, user: str) -> dict[str, Any]:
    body = {
        "model": settings.openai_model_chat,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 900,
    }
    r = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {_openai_key()}", "content-type": "application/json"},
        json=body,
        timeout=60.0,
    )
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"] or "{}")


def _chat_json(system: str, user: str) -> dict[str, Any]:
    if settings.gemini_api_key:
        try:
            return _gemini_chat_json(system, user)
        except Exception as e:
            logger.warning("Gemini chat failed, trying OpenAI: %s", e)
    if _openai_key():
        try:
            return _openai_chat_json(system, user)
        except Exception as e:
            logger.exception("OpenAI chat failed: %s", e)
    return {}


# ---------- Conversation summary ----------
SUMMARY_PROMPT = """Ты помощник менеджера по продажам, который помогает обработать разговор с посетителем выставки.

На вход — расшифровка голосовой заметки и/или текстовая заметка.
Твоя задача — выделить:
- summary: 1-2 предложения, описывающие суть встречи (на русском)
- agreements: о чём конкретно договорились (1-3 предложения)
- next_step: один конкретный следующий шаг для менеджера
- reminder_in_days: через сколько дней поставить напоминание (целое число 1-90, обычно 2-7)
- ai_score: оценка теплоты лида от 1 (холодный) до 100 (очень горячий, готов покупать)
- ai_score_reason: 1 предложение, почему такой балл

Ответ ТОЛЬКО валидным JSON без комментариев со всеми полями. Если данных не хватает — поставь null или короткое уточнение, но никогда не выдумывай факты, которых нет в заметке."""


def summarize_conversation(
    voice_transcript: Optional[str],
    text_notes: Optional[str],
    contact_company: Optional[str] = None,
) -> dict[str, Any]:
    parts = []
    if voice_transcript:
        parts.append(f"Голосовая заметка: {voice_transcript}")
    if text_notes:
        parts.append(f"Текстовая заметка: {text_notes}")
    if contact_company:
        parts.append(f"Компания контакта: {contact_company}")
    if not parts:
        return {}
    return _chat_json(SUMMARY_PROMPT, "\n\n".join(parts))


# ---------- Follow-up generation ----------
FOLLOWUP_PROMPTS = {
    "intro": """Сгенерируй короткое (4-6 предложений) персонализированное вводное письмо на русском
после встречи на выставке. Тон — деловой, тёплый, без воды. Структура: приветствие, ссылка на встречу,
краткое УТП, конкретный следующий шаг. Если есть персонализация — обязательно встрой её.""",
    "proposal": """Сгенерируй краткое сопроводительное письмо к коммерческому предложению (5-8 предложений).
Деловой тон, на русском. Структура: благодарность за встречу, ссылка на договорённости, краткие тезисы КП,
конкретные сроки/условия, призыв к действию. Если есть персонализация (скидка, кейс, шоу-рум) — встрой её.""",
    "invite": """Сгенерируй персональное приглашение (4-6 предложений) на демо/в шоу-рум/на онлайн-встречу.
Деловой тёплый тон, на русском. Чёткая дата/период (если есть в персонализации) + ценность для получателя
+ варианты времени.""",
    "call": """Сгенерируй короткий план звонка (3-5 пунктов): что обсудить, что предложить, какие вопросы задать.
Используй контекст разговора и договорённости. На русском.""",
}


def generate_followup(
    kind: str,
    contact: dict[str, Any],
    personalization: Optional[str],
    template_body: Optional[str] = None,
) -> dict[str, str]:
    if not has_chat():
        return {"subject": "", "body": ""}
    sys_prompt = FOLLOWUP_PROMPTS.get(kind, FOLLOWUP_PROMPTS["intro"])
    if template_body:
        sys_prompt += f"\n\nИСПОЛЬЗУЙ ЭТОТ ШАБЛОН КАК ОСНОВУ (адаптируй и персонализируй):\n{template_body}"
    sys_prompt += '\n\nВерни строго JSON: {"subject": "...", "body": "..."}'

    ctx = {
        "имя": contact.get("name"),
        "должность": contact.get("role_title"),
        "компания": contact.get("contact_company"),
        "договорённости": contact.get("agreements"),
        "следующий_шаг": contact.get("next_step"),
        "резюме_встречи": contact.get("summary"),
        "персонализация": personalization,
    }
    result = _chat_json(sys_prompt, "Сгенерируй письмо. Контекст:\n" + json.dumps(ctx, ensure_ascii=False, indent=2))
    return {
        "subject": str(result.get("subject", "")),
        "body": str(result.get("body", "")),
    }
