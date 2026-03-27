"""
tests/unit/test_story_service.py — Unit tests for the StoryService.

Mocks the repository and Celery tasks to isolate business logic.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from services.story_service import StoryService
from storage.db import Story

@pytest.mark.asyncio
async def test_create_story_success(mock_repo):
    """Verify that create_story persists to DB and dispatches to Celery."""
    service = StoryService(mock_repo)
    
    # Setup mock return value
    mock_story = Story(id="test-id", topic="Test Topic", status="queued")
    mock_repo.create = AsyncMock(return_value=mock_story)
    
    story_data = {
        "topic": "Test Topic",
        "tone": "funny",
        "audience": "kids",
        "length": "short"
    }

    # Use patch to mock the Celery task inside the service
    with patch("tasks.celery_app.run_story_pipeline.delay") as mock_delay:
        result = await service.create_story(story_data)
        
        # 1. Check DB call
        mock_repo.create.assert_called_once_with(story_data)
        
        # 2. Check Celery dispatch
        mock_delay.assert_called_once()
        args, _ = mock_delay.call_args
        assert args[0]["story_id"] == "test-id"
        
        assert result.id == "test-id"


@pytest.mark.asyncio
async def test_approve_story_success(mock_repo):
    """Verify that approve_story updates the status and re-dispatches."""
    service = StoryService(mock_repo)
    
    # Setup mock story
    mock_story = Story(
        id="test-id", 
        topic="Test Topic", 
        user_prefs={}, 
        outline_json={"hook": "test"}
    )
    mock_repo.get_by_id = AsyncMock(return_value=mock_story)
    mock_repo.update = AsyncMock()
    
    with patch("tasks.celery_app.run_story_pipeline.delay") as mock_delay:
        await service.approve_story("test-id")
        
        # 1. Check DB update (approved=True)
        mock_repo.update.assert_called_once()
        # Positional args: update(story_id, updates_dict)
        args, _ = mock_repo.update.call_args
        updates_dict = args[1]
        assert updates_dict["user_prefs"]["approved"] is True
        assert updates_dict["status"] == "processing"
        
        # 2. Check Celery re-dispatch
        mock_delay.assert_called_once()
