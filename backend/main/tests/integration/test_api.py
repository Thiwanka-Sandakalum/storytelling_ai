"""
tests/integration/test_api.py — Integration tests for the FastAPI layer.

Uses dependency overrides to mock the Service layer, testing the routes
and their interaction with Pydantic schemas.
"""

import pytest
from unittest.mock import AsyncMock
from storage.db import Story

@pytest.mark.asyncio
async def test_generate_story_endpoint(client, mock_service):
    """Verify that POST /stories/generate correctly routes to the service."""
    # Mock the service response
    mock_story = Story(id="api-test-id", status="queued")
    mock_service.create_story = AsyncMock(return_value=mock_story)
    
    payload = {
        "topic": "API Test",
        "tone": "educational",
        "audience": "devs",
        "length": "short"
    }
    
    response = await client.post("/stories/generate", json=payload)
    
    assert response.status_code == 202
    data = response.json()
    assert data["story_id"] == "api-test-id"
    assert data["status"] == "queued"
    
    # Ensure service was called correctly
    mock_service.create_story.assert_called_once()


@pytest.mark.asyncio
async def test_get_story_endpoint_success(client, mock_service):
    """Verify that GET /stories/{id} enriches data correctly."""
    from datetime import datetime
    
    # Mock story from database
    mock_story = Story(
        id="test-id",
        topic="Test Topic",
        tone="dark",
        audience="all",
        length="short",
        status="completed",
        outline_json={"hook": "test", "sections": [], "climax": "test", "closing": "test"},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    mock_service.get_story_status = AsyncMock(return_value={
        "story": mock_story,
        "script_url": "http://signed-url"
    })
    
    response = await client.get("/stories/test-id")
    
    assert response.status_code == 200
    data = response.json()
    assert data["story_id"] == "test-id"
    assert data["script_url"] == "http://signed-url"
    assert data["outline"]["hook"] == "test"


@pytest.mark.asyncio
async def test_get_story_not_found(client, mock_service):
    """Verify 404 behavior for unknown stories."""
    from fastapi import HTTPException
    
    # In FastAPI, if the service raises an HTTPException, the router catches it.
    # But in our mocked client, we must ensure the mock_service raises it.
    mock_service.get_story_status = AsyncMock(side_effect=HTTPException(status_code=404, detail="Not found"))
    
    response = await client.get("/stories/unknown")
    assert response.status_code == 404
    assert "Not found" in response.json()["detail"]
