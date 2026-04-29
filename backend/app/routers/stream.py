"""SSE stream endpoint.

EventSource cannot send Authorization headers, so we accept the JWT via the
`?token=` query parameter. Token is verified against the same JWT machinery
as the rest of /api.
"""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.deps import resolve_user_from_token
from app.events import subscribe, unsubscribe

router = APIRouter(prefix="/api/stream", tags=["stream"])


@router.get("")
async def event_stream(request: Request, token: str) -> StreamingResponse:
    user = await resolve_user_from_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    org_id = user.organization_id

    async def gen():
        q = subscribe(org_id)
        try:
            # initial hello so the client knows we're connected
            yield (
                f"event: hello\n"
                f"data: {json.dumps({'org_id': org_id, 'ts': datetime.now(timezone.utc).isoformat()})}\n\n"
            )
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield item
                except asyncio.TimeoutError:
                    # keep-alive ping (comment lines are ignored by EventSource)
                    yield ": ping\n\n"
        finally:
            unsubscribe(org_id, q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
