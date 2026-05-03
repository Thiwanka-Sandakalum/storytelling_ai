"""In-process event broker for streaming story pipeline updates to SSE clients."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import AsyncIterator


class StoryEventBroker:
    """Fan out live story events to any connected SSE subscribers."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict]]] = defaultdict(set)
        self._last_event: dict[str, dict] = {}
        self._lock = asyncio.Lock()

    async def publish(self, story_id: str, event: dict) -> None:
        """Publish an event to all active subscribers for a story."""
        async with self._lock:
            payload = dict(event)
            self._last_event[story_id] = payload
            for queue in list(self._subscribers.get(story_id, ())):
                queue.put_nowait(dict(payload))

    async def get_last_event(self, story_id: str) -> dict | None:
        """Return the most recent event for a story, if any."""
        async with self._lock:
            event = self._last_event.get(story_id)
            return dict(event) if event is not None else None

    @asynccontextmanager
    async def subscribe(self, story_id: str) -> AsyncIterator[asyncio.Queue[dict]]:
        """Create a queue subscriber for a story's event stream."""
        queue: asyncio.Queue[dict] = asyncio.Queue()
        async with self._lock:
            self._subscribers[story_id].add(queue)
            last_event = self._last_event.get(story_id)
            if last_event is not None:
                queue.put_nowait(dict(last_event))

        try:
            yield queue
        finally:
            async with self._lock:
                subscribers = self._subscribers.get(story_id)
                if subscribers is not None:
                    subscribers.discard(queue)
                    if not subscribers:
                        self._subscribers.pop(story_id, None)


story_event_broker = StoryEventBroker()
