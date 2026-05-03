"""
tests/unit/test_cover_artist.py - Unit tests for Imagen cover generation node.
"""

import base64
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from google.genai.errors import ClientError

from agents import cover_artist


@pytest.mark.asyncio
async def test_generate_cover_returns_base64(monkeypatch):
    events = []

    class _FakeModels:
        async def generate_images(self, *, model, prompt, config):
            assert model == "imagen-4.0-generate-001"
            assert "book cover" in prompt.lower()
            assert config.aspect_ratio == "3:4"
            return SimpleNamespace(
                generated_images=[
                    SimpleNamespace(image=SimpleNamespace(image_bytes=b"fake-png-bytes"))
                ]
            )

    class _FakeClient:
        def __init__(self):
            self.aio = SimpleNamespace(models=_FakeModels())

    monkeypatch.setattr(cover_artist, "_get_client", lambda: _FakeClient())
    monkeypatch.setattr(cover_artist, "get_stream_writer", lambda: events.append)
    monkeypatch.setattr(
        cover_artist.settings,
        "imagen_model",
        "imagen-4.0-generate-001",
        raising=False,
    )

    state = {
        "story_id": "story-1",
        "topic": "A lighthouse at the edge of time",
        "tone": "inspirational",
        "audience": "general audience",
        "length": "short",
        "user_prefs": {},
        "outline": {
            "hook": "The sea remembers what the land forgot.",
            "chapters": [],
            "sections": [],
            "climax": "The light is restored.",
            "closing": "A hopeful dawn.",
            "target_words": 1400,
            "target_minutes": 10,
        },
        "sections_done": [],
        "draft_script": None,
        "script_path": None,
        "cover_image": None,
        "retry_count": 0,
        "error": None,
    }

    result = await cover_artist.generate_cover(state)

    assert "cover_image" in result
    assert base64.b64decode(result["cover_image"]) == b"fake-png-bytes"
    assert events[0]["node"] == "generate_cover"
    assert events[-1]["status"] == "cover_generated"


@pytest.mark.asyncio
async def test_generate_cover_raises_if_no_images(monkeypatch):
    class _FakeModels:
        async def generate_images(self, *, model, prompt, config):
            return SimpleNamespace(generated_images=[])

    class _FakeClient:
        def __init__(self):
            self.aio = SimpleNamespace(models=_FakeModels())

    monkeypatch.setattr(cover_artist, "_get_client", lambda: _FakeClient())
    monkeypatch.setattr(cover_artist, "get_stream_writer", lambda: (lambda _: None))

    state = {
        "story_id": "story-1",
        "topic": "Topic",
        "tone": "funny",
        "audience": "kids",
        "length": "short",
        "user_prefs": {},
        "outline": None,
        "sections_done": [],
        "draft_script": None,
        "script_path": None,
        "cover_image": None,
        "retry_count": 0,
        "error": None,
    }

    with pytest.raises(ValueError, match="no images"):
        await cover_artist.generate_cover(state)


def _make_client_error(code: int, message: str) -> ClientError:
    """Build a ClientError matching the google-genai SDK structure."""
    response_json = {"error": {"code": code, "message": message, "status": "INVALID_ARGUMENT"}}
    mock_response = MagicMock()
    mock_response.status_code = code
    return ClientError(code, response_json, mock_response)


@pytest.mark.asyncio
async def test_generate_cover_degrades_gracefully_on_billing_error(monkeypatch):
    """Billing/plan errors must be silently swallowed; pipeline must not crash."""

    class _FakeModels:
        async def generate_images(self, **_kwargs):
            raise _make_client_error(
                400,
                "Imagen 3 is only available on paid plans. Please upgrade your account.",
            )

    class _FakeClient:
        def __init__(self):
            self.aio = SimpleNamespace(models=_FakeModels())

    events = []
    monkeypatch.setattr(cover_artist, "_get_client", lambda: _FakeClient())
    monkeypatch.setattr(cover_artist, "get_stream_writer", lambda: events.append)
    monkeypatch.setattr(
        cover_artist.settings, "imagen_model", "imagen-4.0-generate-001", raising=False
    )

    state = {
        "story_id": "story-billing",
        "topic": "Topic",
        "tone": "funny",
        "audience": "kids",
        "length": "short",
        "user_prefs": {},
        "outline": {"hook": "hook", "climax": "climax"},
        "sections_done": [],
        "draft_script": None,
        "script_path": None,
        "cover_image": None,
        "retry_count": 0,
        "error": None,
    }

    result = await cover_artist.generate_cover(state)

    # Must return gracefully with None — not raise
    assert result == {"cover_image": None}
    statuses = [e["status"] for e in events if isinstance(e, dict)]
    assert "cover_skipped" in statuses


@pytest.mark.asyncio
async def test_generate_cover_reraises_transient_errors(monkeypatch):
    """Transient / unexpected errors must propagate so LangGraph can handle them."""

    class _FakeModels:
        async def generate_images(self, **_kwargs):
            raise _make_client_error(503, "Service temporarily unavailable.")

    class _FakeClient:
        def __init__(self):
            self.aio = SimpleNamespace(models=_FakeModels())

    monkeypatch.setattr(cover_artist, "_get_client", lambda: _FakeClient())
    monkeypatch.setattr(cover_artist, "get_stream_writer", lambda: (lambda _: None))

    state = {
        "story_id": "story-transient",
        "topic": "Topic",
        "tone": "funny",
        "audience": "kids",
        "length": "short",
        "user_prefs": {},
        "outline": None,
        "sections_done": [],
        "draft_script": None,
        "script_path": None,
        "cover_image": None,
        "retry_count": 0,
        "error": None,
    }

    with pytest.raises(ClientError):
        await cover_artist.generate_cover(state)
