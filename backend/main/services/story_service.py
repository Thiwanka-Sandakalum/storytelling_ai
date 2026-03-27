"""
services/story_service.py — Domain service for story orchestration.
"""

import logging
import httpx
from typing import Any, Sequence
from fastapi import HTTPException, status

from background import submit_background_task
from config import settings
from pipeline_runner import run_story_pipeline_async
from repositories.story_repo import StoryRepository

logger = logging.getLogger(__name__)


class StoryService:
    """Orchestrates story generation, retrieval, and management."""

    def __init__(self, repo: StoryRepository):
        self.repo = repo

    async def create_story(self, data: dict[str, Any]) -> Any:
        """Initialize a new story and dispatch it to the pipeline."""
        # 1. Persist to DB
        voice_id = data.pop("voice_id", "Zephyr")
        if "user_prefs" not in data:
            data["user_prefs"] = {}
        data["user_prefs"]["voice"] = voice_id
        
        story = await self.repo.create(data)

        # 2. Dispatch in-process background task
        # We pass the full state required by LangGraph
        state = {
            "story_id":      story.id,
            "topic":         story.topic,
            "tone":          story.tone,
            "audience":      story.audience,
            "length":        story.length,
            "user_prefs":    story.user_prefs or {},
            "outline":       None,
            "sections_done": [],
        }
        submit_background_task(
            run_story_pipeline_async(state),
            name=f"story-{story.id}",
        )
        logger.info("service.story_submitted id=%s", story.id)
        return story

    async def get_story_status(self, story_id: str) -> dict[str, Any]:
        """Fetch a story and enrich with temporary presigned URLs."""
        story = await self.repo.get_by_id(story_id)
        if not story:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Story '{story_id}' not found.",
            )

        return {"story": story}

    async def update_outline(self, story_id: str, outline_dict: dict[str, Any]) -> Any:
        """Update the planned outline (manual intervention)."""
        story = await self.repo.get_by_id(story_id)
        if not story:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Story '{story_id}' not found.",
            )

        await self.repo.update(story_id, {"outline_json": outline_dict})
        return await self.repo.get_by_id(story_id)

    async def approve_story(self, story_id: str) -> Any:
        """Mark a story as approved and trigger the next pipeline phase."""
        story = await self.repo.get_by_id(story_id)
        if not story:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Story '{story_id}' not found.",
            )

        # 1. Update status and prefs
        user_prefs = dict(story.user_prefs or {})
        user_prefs["approved"] = True
        await self.repo.update(story_id, {"user_prefs": user_prefs, "status": "processing"})

        # 2. Re-dispatch in-process background task
        state = {
            "story_id":      story.id,
            "topic":         story.topic,
            "tone":          story.tone,
            "audience":      story.audience,
            "length":        story.length,
            "user_prefs":    user_prefs,
            "outline":       story.outline_json,
            "sections_done": [],
        }
        submit_background_task(
            run_story_pipeline_async(state),
            name=f"story-{story.id}",
        )
        logger.info("service.story_approved id=%s", story_id)
        return await self.repo.get_by_id(story_id)

    async def list_history(self, limit: int = 50, offset: int = 0) -> tuple[Sequence[Any], int]:
        """Return a page of stories and the total count."""
        stories = await self.repo.list_all(limit=limit, offset=offset)
        total = await self.repo.count()
        return stories, total

    async def delete_story(self, story_id: str) -> bool:
        """Perform a cascaded deletion of story metadata and media."""
        story = await self.repo.get_by_id(story_id)
        if not story:
            return False

        return await self.repo.delete(story_id)

    async def create_tts_session(self, story_id: str, user_id: str | None = None) -> dict[str, Any]:
        """Coordinate with TTS service to create a live narration session."""
        story = await self.repo.get_by_id(story_id)
        if not story or not story.draft_script:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Story '{story_id}' has no generated script yet.",
            )

        # Pass script text directly — no S3 round-trip needed
        url = f"{settings.tts_service_url}/api/sessions"
        payload = {
            "story_id": story_id,
            "user_id": user_id,
            "voice": story.user_prefs.get("voice", "Puck") if story.user_prefs else "Puck",
            "script_text": story.draft_script,
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, timeout=5.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error("service.tts_integration_failed id=%s error=%s", story_id, str(e))
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Failed to initialize TTS live session.",
                )
