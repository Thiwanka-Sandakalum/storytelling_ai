"""
tests/unit/test_story_service.py — Unit tests for the StoryService.

Mocks the repository and background scheduling to isolate business logic.
"""

import pytest
from unittest.mock import AsyncMock, patch
from services.story_service import StoryService
from storage.db import Story

@pytest.mark.asyncio
async def test_create_story_success(mock_repo):
    """Verify that create_story persists to DB and dispatches in-process."""
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

    # Use patch to mock the background scheduler inside the service
    with patch("services.story_service.submit_background_task") as mock_submit:
        mock_submit.side_effect = lambda coro, **kwargs: coro.close()
        result = await service.create_story(story_data)
        
        # 1. Check DB call
        mock_repo.create.assert_called_once()
        create_payload = mock_repo.create.call_args.args[0]
        assert create_payload["topic"] == "Test Topic"
        assert create_payload["tone"] == "funny"
        assert create_payload["audience"] == "kids"
        assert create_payload["length"] == "short"
        assert create_payload["user_prefs"]["voice"] == "Puck"
        assert create_payload["user_prefs"]["require_approval"] is False
        
        # 2. Check background dispatch
        mock_submit.assert_called_once()
        args, _ = mock_submit.call_args
        scheduled_coro = args[0]
        assert hasattr(scheduled_coro, "__await__")
        
        assert result.id == "test-id"


@pytest.mark.asyncio
async def test_approve_story_success(mock_repo):
    """Verify that approve_story preflights checkpoint and schedules resume."""
    service = StoryService(mock_repo)
    
    # Setup mock story
    mock_story = Story(
        id="test-id", 
        topic="Test Topic", 
        user_prefs={}, 
        outline_json={"hook": "test"}
    )
    mock_repo.get_by_id = AsyncMock(return_value=mock_story)
    
    with patch("services.story_service.has_resume_checkpoint", new=AsyncMock(return_value=True)) as mock_has_checkpoint, \
         patch("services.story_service.resume_story_pipeline_async", new=AsyncMock()) as mock_resume, \
         patch("services.story_service.submit_background_task") as mock_submit:
        mock_submit.side_effect = lambda coro, **kwargs: coro.close()
        await service.approve_story("test-id")

        mock_has_checkpoint.assert_awaited_once_with("test-id")
        mock_resume.assert_called_once_with(
            story_id="test-id",
            resume_value={"hook": "test"},
        )
        mock_submit.assert_called_once()
