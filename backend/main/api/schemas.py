"""
api/schemas.py — Pydantic models for the REST API.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field




class StoryRequest(BaseModel):
    """Payload for POST /stories/generate."""

    topic: str = Field(
        ...,
        min_length=3,
        max_length=500,
        description="The subject or theme of the story.",
        examples=["The rise of artificial intelligence"],
    )
    tone: Literal["inspirational", "dark", "educational", "funny"] = Field(
        default="inspirational",
        description="Desired emotional tone of the narration.",
    )
    audience: str = Field(
        default="general audience",
        max_length=200,
        description="Who the story is written for (e.g. 'tech enthusiasts', 'teenagers').",
    )
    length: Literal["short", "medium", "long"] = Field(
        default="medium",
        description="Approximate story length: short (~3 sections), medium (~4), long (~5).",
    )
    user_prefs: dict = Field(
        default_factory=dict,
        description="Optional free-form style preferences passed through to agents.",
    )
    voice_id: Literal["Puck", "Charon", "Kore", "Fenrir", "Aoede"] = Field(
        default="Puck",
        description="Supported Gemini Native Audio voices.",
    )




class StoryResponse(BaseModel):
    """Response for POST /stories/generate — returns immediately with queued status."""

    story_id: str = Field(description="Unique identifier for this generation job.")
    status: str = Field(description="Initial job status: always 'queued'.")


class StorySectionOut(BaseModel):
    """Individual section of the story outline."""

    title: str
    description: str
    content: str | None = None


class StoryOutlineOut(BaseModel):
    """Serialisable form of the story outline."""

    hook: str
    sections: list[StorySectionOut]
    climax: str
    closing: str


class StoryStatusResponse(BaseModel):
    """Response for GET /stories/{story_id} — full job status and outputs."""

    story_id: str
    topic: str
    tone: str
    audience: str
    length: str
    status: str = Field(
        description="queued | processing | completed | failed"
    )
    outline: StoryOutlineOut | None = None
    draft_script: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class StorySummary(BaseModel):
    """Minimal story metadata for listing."""
    story_id: str
    topic: str
    status: str
    created_at: datetime


class StoryListResponse(BaseModel):
    """Response for GET /stories/."""
    stories: list[StorySummary]
    total: int


class ListenResponse(BaseModel):
    """Response for POST /stories/{id}/listen — returns session info for TTS."""

    session_id: str
    user_id: str
    segment_count: int


class HealthResponse(BaseModel):
    """Response for GET /health."""

    status: str = "ok"
    environment: str
