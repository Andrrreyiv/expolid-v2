"""In-process event broker for SSE.

Events are broadcast per organization. Anything that subscribes via
`subscribe(org_id)` gets an asyncio Queue; producers call `publish(org_id, event)`.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

_subscribers: dict[int, set[asyncio.Queue[str]]] = {}


def subscribe(org_id: int) -> asyncio.Queue[str]:
    q: asyncio.Queue[str] = asyncio.Queue(maxsize=200)
    _subscribers.setdefault(org_id, set()).add(q)
    return q


def unsubscribe(org_id: int, q: asyncio.Queue[str]) -> None:
    bucket = _subscribers.get(org_id)
    if bucket is None:
        return
    bucket.discard(q)
    if not bucket:
        _subscribers.pop(org_id, None)


def publish(org_id: int, event_type: str, payload: dict[str, Any]) -> None:
    bucket = _subscribers.get(org_id)
    if not bucket:
        return
    body = f"event: {event_type}\ndata: {json.dumps(payload, default=str)}\n\n"
    for q in list(bucket):
        try:
            q.put_nowait(body)
        except asyncio.QueueFull:
            # drop oldest by getting once; if that fails just skip
            try:
                q.get_nowait()
                q.put_nowait(body)
            except Exception:
                pass
