"""
tests/conftest.py — Pytest configuration and shared fixtures.

Provides:
- Async loop for aio-test
- Mock repository and service instances
- FastAPI TestClient with dependency overrides
"""

import pytest
import pytest_asyncio
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from api.main import app
from api.dependencies import get_story_service
from services.story_service import StoryService
from repositories.story_repo import StoryRepository


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture
async def mock_session():
    """Returns an AsyncMock representing a DB session."""
    return AsyncMock(spec=AsyncSession)


@pytest.fixture
def mock_repo(mock_session):
    """Returns a StoryRepository with a mocked session."""
    repo = StoryRepository(mock_session)
    # We can also mock specific methods if needed
    # repo.get_by_id = AsyncMock()
    return repo


@pytest.fixture
def mock_service(mock_repo):
    """Returns a StoryService with a mocked repository."""
    return StoryService(mock_repo)


@pytest_asyncio.fixture
async def client(mock_service) -> AsyncGenerator[AsyncClient, None]:
    """
    Returns an AsyncClient for the FastAPI app with the StoryService mocked.
    """
    # Override the dependency
    app.dependency_overrides[get_story_service] = lambda: mock_service
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
    
    # Cleanup overrides
    app.dependency_overrides.clear()
