"""
models.py — Storyteller API schemas (Pydantic).
"""
from pydantic import BaseModel
from typing import Optional, Literal


class CreateSessionRequest(BaseModel):
    """Request body for creating a new storyteller session."""

    story_id: str
    user_id: Optional[str] = None
    voice: Literal["Puck", "Charon", "Kore", "Fenrir", "Aoede"] = "Puck"
    script_text: Optional[str] = None  # Script passed directly from main-api


class CreateSessionResponse(BaseModel):
    """Response body for session creation."""

    session_id: str
    user_id: str
    segment_data: list
    segment_count: int
