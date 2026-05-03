"""
services/story_service.py — Domain service for story orchestration.
"""

import logging
import httpx
from typing import Any, Sequence
from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError

from background import submit_background_task
from config import settings
from pipeline_runner import (
    has_resume_checkpoint,
    run_story_pipeline_async,
    resume_story_pipeline_async,
)
from repositories.story_repo import StoryRepository

logger = logging.getLogger(__name__)


class StoryService:
    """Orchestrates story generation, retrieval, and management."""

    def __init__(self, repo: StoryRepository, tts_client: httpx.AsyncClient | None = None):
        self.repo = repo
        self.tts_client = tts_client

    async def create_story(self, data: dict[str, Any]) -> Any:
        """Initialize a new story and dispatch it to the pipeline."""
        # 1. Persist to DB
        voice_id = data.pop("voice_id", "Puck")
        require_approval = data.pop("require_approval", False)
        if "user_prefs" not in data:
            data["user_prefs"] = {}
        data["user_prefs"]["voice"] = voice_id
        data["user_prefs"]["require_approval"] = require_approval
        
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
            "draft_script":  None,
            "script_path":   None,
            "cover_image":   None,
            "retry_count":   0,
            "error":         None,
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
        """Resume the paused pipeline after human outline approval."""
        story = await self.repo.get_by_id(story_id)
        if not story:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Story '{story_id}' not found.",
            )

        if not await has_resume_checkpoint(story.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Cannot approve this story because the paused pipeline state "
                    "is no longer available. This usually happens after an API "
                    "restart when using in-memory checkpoints. Please regenerate "
                    "the story."
                ),
            )

        # Pass the current outline_json (possibly edited via PATCH /outline) back
        # into the pipeline as the resume value.  The await_approval node will
        # receive it as the return value of interrupt() and optionally update the
        # LangGraph state if it differs from the originally planned outline.
        submit_background_task(
            resume_story_pipeline_async(
                story_id=story.id,
                resume_value=story.outline_json or {},
            ),
            name=f"story-{story.id}",
        )
        logger.info("service.story_approved id=%s", story_id)
        return await self.repo.get_by_id(story_id)

    async def list_history(self, limit: int = 50, offset: int = 0) -> tuple[Sequence[Any], int]:
        """Return a page of stories and the total count."""
        try:
            stories = await self.repo.list_all(limit=limit, offset=offset)
            total = await self.repo.count()
        except (SQLAlchemyError, TimeoutError) as exc:
            logger.warning("service.list_history_unavailable error=%s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Story history is temporarily unavailable. Please retry shortly.",
            ) from exc
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

        client = self.tts_client

        try:
            if client is not None:
                response = await client.post(url, json=payload)
            else:
                # Backward-compatible fallback for tests or non-FastAPI call sites.
                async with httpx.AsyncClient(timeout=5.0) as ephemeral_client:
                    response = await ephemeral_client.post(url, json=payload)

            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error("service.tts_integration_failed id=%s error=%s", story_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to initialize TTS live session.",
            )
