"""In-process SSE event bus per company. Простая реализация — не масштабируется на multi-worker, но для MVP хватит."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any


class EventBus:
    def __init__(self) -> None:
        # company_id -> list of asyncio.Queue
        self._listeners: dict[str, list[asyncio.Queue]] = defaultdict(list)

    async def subscribe(self, company_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._listeners[company_id].append(q)
        return q

    def unsubscribe(self, company_id: str, q: asyncio.Queue) -> None:
        try:
            self._listeners[company_id].remove(q)
        except ValueError:
            pass

    def publish(self, company_id: str, event: str, payload: Any) -> None:
        msg = {"event": event, "data": payload}
        for q in list(self._listeners.get(company_id, [])):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass

    @staticmethod
    def encode(msg: dict) -> str:
        return f"event: {msg['event']}\ndata: {json.dumps(msg['data'], ensure_ascii=False)}\n\n"


bus = EventBus()
