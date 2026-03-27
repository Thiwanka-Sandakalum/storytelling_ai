"""
api/dependencies.py — FastAPI dependency injection.

Centralizes the creation of database sessions, repositories, and services.
This makes the routes cleaner and enables easy mocking for unit tests.
"""

from typing import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from storage.db import AsyncSessionFactory
from repositories.story_repo import StoryRepository
from services.story_service import StoryService


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide an async database session per request."""
    async with AsyncSessionFactory() as session:
        try:
            yield session
        finally:
            await session.close()


def get_story_repo(session: AsyncSession = Depends(get_db_session)) -> StoryRepository:
    """Inject the StoryRepository."""
    return StoryRepository(session)


def get_story_service(repo: StoryRepository = Depends(get_story_repo)) -> StoryService:
    """Inject the StoryService (the main business logic entry point)."""
    return StoryService(repo)
