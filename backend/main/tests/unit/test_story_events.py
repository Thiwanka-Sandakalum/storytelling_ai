import asyncio

import pytest

from story_events import StoryEventBroker


@pytest.mark.asyncio
async def test_story_event_broker_fanout_and_replay() -> None:
    broker = StoryEventBroker()

    async with broker.subscribe("story-1") as queue:
        await broker.publish("story-1", {"story_id": "story-1", "status": "processing"})
        first = await asyncio.wait_for(queue.get(), timeout=1)
        assert first["status"] == "processing"

    async with broker.subscribe("story-1") as replay_queue:
        replayed = await asyncio.wait_for(replay_queue.get(), timeout=1)
        assert replayed["story_id"] == "story-1"
        assert replayed["status"] == "processing"
