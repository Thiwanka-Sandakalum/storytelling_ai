"""
api/dependencies.py — FastAPI dependency injection.

Centralizes the creation of database sessions, repositories, and services.
This makes the routes cleaner and enables easy mocking for unit tests.
"""

from typing import AsyncGenerator
import httpx
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from storage.db import AsyncSessionFactory
from repositories.story_repo import StoryRepository
from services.story_service import StoryService


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide an async database session per request."""
    async with AsyncSessionFactory() as session:
        yield session


def get_story_repo(session: AsyncSession = Depends(get_db_session)) -> StoryRepository:
    """Inject the StoryRepository."""
    return StoryRepository(session)


def get_tts_http_client(request: Request) -> httpx.AsyncClient | None:
    """Provide the shared TTS HTTP client initialized during app lifespan."""
    return getattr(request.app.state, "tts_http_client", None)


def get_story_service(
    repo: StoryRepository = Depends(get_story_repo),
    tts_http_client: httpx.AsyncClient | None = Depends(get_tts_http_client),
) -> StoryService:
    """Inject the StoryService (the main business logic entry point)."""
    return StoryService(repo, tts_client=tts_http_client)
