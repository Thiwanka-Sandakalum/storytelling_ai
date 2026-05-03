"""
repositories/story_repo.py — Story repository for database operations.
"""

import logging
from typing import Any, Sequence
from sqlalchemy import select, update, delete, func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from storage.db import Story

logger = logging.getLogger(__name__)


class StoryRepository:
    """Handles all persistence logic for Story objects."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def _rollback_after_error(self, exc: Exception) -> None:
        """Best-effort rollback to recover a session after execution/commit failures."""
        if not isinstance(exc, (SQLAlchemyError, TimeoutError)):
            return
        try:
            await self.session.rollback()
        except Exception:
            logger.exception("repo.rollback_failed")

    async def create(self, data: dict[str, Any]) -> Story:
        """Create and persist a new Story."""
        story = Story(**data)
        self.session.add(story)
        try:
            await self.session.commit()
            await self.session.refresh(story)
        except Exception as exc:
            await self._rollback_after_error(exc)
            raise
        logger.info("repo.story_created id=%s", story.id)
        return story

    async def get_by_id(self, story_id: str) -> Story | None:
        """Fetch a single story by ID."""
        try:
            result = await self.session.execute(
                select(Story).where(Story.id == story_id)
            )
        except Exception as exc:
            await self._rollback_after_error(exc)
            raise
        return result.scalar_one_or_none()

    async def list_all(self, limit: int = 50, offset: int = 0) -> Sequence[Story]:
        """List stories with pagination, ordered by most recent first."""
        stmt = (
            select(Story)
            .order_by(Story.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        try:
            result = await self.session.execute(stmt)
        except Exception as exc:
            await self._rollback_after_error(exc)
            raise
        return result.scalars().all()

    async def update(self, story_id: str, updates: dict[str, Any]) -> None:
        """Apply partial updates to a story."""
        try:
            await self.session.execute(
                update(Story).where(Story.id == story_id).values(**updates)
            )
            await self.session.commit()
        except Exception as exc:
            await self._rollback_after_error(exc)
            raise
        logger.info("repo.story_updated id=%s updates=%s", story_id, list(updates))

    async def delete(self, story_id: str) -> bool:
        """Delete a story. Returns True if a row was removed."""
        try:
            result = await self.session.execute(
                delete(Story).where(Story.id == story_id)
            )
            await self.session.commit()
        except Exception as exc:
            await self._rollback_after_error(exc)
            raise
        return bool(result.rowcount > 0)

    async def count(self) -> int:
        """Return the total number of stories in the database."""
        try:
            result = await self.session.execute(select(func.count(Story.id)))
        except Exception as exc:
            await self._rollback_after_error(exc)
            raise
        return result.scalar_one()
