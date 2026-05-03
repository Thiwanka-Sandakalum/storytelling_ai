"""
agents/cover_artist.py - Book cover image generation node using Gemini Imagen.
"""

import base64
import logging
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import ClientError
from langgraph.config import get_stream_writer

from config import settings
from state.schema import StoryState

logger = logging.getLogger(__name__)


def _build_cover_prompt(state: StoryState) -> str:
    """Construct a concise, cover-focused prompt from story context."""
    outline = state.get("outline") or {}
    hook = outline.get("hook") or ""
    climax = outline.get("climax") or ""

    return (
        "Create a cinematic, high-quality illustrated book cover image. "
        "No text, no typography, no logos, no watermarks. "
        "Portrait composition suitable for a novel cover. "
        f"Topic: {state['topic']}. "
        f"Tone: {state['tone']}. "
        f"Audience: {state['audience']}. "
        f"Opening hook: {hook}. "
        f"Climax: {climax}."
    )


def _first_image_bytes(response: Any) -> bytes:
    """Extract first generated image bytes from SDK response across versions."""
    generated_images = getattr(response, "generated_images", None)
    if generated_images is None and isinstance(response, dict):
        generated_images = response.get("generated_images")

    if not generated_images:
        raise ValueError("Imagen returned no images.")

    first = generated_images[0]
    image = getattr(first, "image", None)
    if image is None and isinstance(first, dict):
        image = first.get("image")

    if image is None:
        raise ValueError("Imagen returned an image entry without image data.")

    image_bytes = getattr(image, "image_bytes", None)
    if image_bytes is None and isinstance(image, dict):
        image_bytes = image.get("image_bytes") or image.get("imageBytes")

    if image_bytes is None:
        raise ValueError("Imagen response did not contain image bytes.")

    if isinstance(image_bytes, str):
        return base64.b64decode(image_bytes)

    if isinstance(image_bytes, bytes):
        return image_bytes

    raise TypeError("Imagen image bytes were in an unexpected format.")


def _get_client() -> genai.Client:
    if settings.using_vertex_ai:
        if not settings.vertex_project_id.strip():
            raise ValueError("VERTEX_PROJECT_ID is required when USE_VERTEX_AI=true.")

        kwargs: dict[str, Any] = {
            "vertexai": True,
            "project": settings.vertex_project_id,
            "location": settings.vertex_location,
        }
        return genai.Client(**kwargs)

    return genai.Client(api_key=settings.gemini_api_key)


# Error codes that indicate non-retryable billing / plan restrictions.
_BILLING_CODES = frozenset({400, 403})
_BILLING_PHRASES = ("paid plans", "billing", "quota", "permission", "forbidden")


def _is_billing_error(exc: ClientError) -> bool:
    """Return True if this error is a permanent billing/plan restriction."""
    msg = str(exc).lower()
    if exc.code in _BILLING_CODES and any(p in msg for p in _BILLING_PHRASES):
        return True
    return False


async def generate_cover(state: StoryState) -> dict:
    """
    Generate a story cover image using Imagen and return it as base64.

    Degrades gracefully if the API key does not have Imagen access (free tier)
    so the rest of the pipeline (story text) is not affected.
    """
    writer = get_stream_writer()
    writer(
        {
            "node": "generate_cover",
            "status": "cover_generating",
            "message": "Generating story cover image...",
        }
    )

    prompt = _build_cover_prompt(state)
    client = _get_client()

    logger.info("cover.start story_id=%s model=%s", state["story_id"], settings.imagen_model)

    try:
        response = await client.aio.models.generate_images(
            model=settings.imagen_model,
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="3:4",
                person_generation="allow_adult",
            ),
        )
    except ClientError as exc:
        if _is_billing_error(exc):
            logger.warning(
                "cover.skipped story_id=%s reason='billing/plan restriction' error=%s",
                state["story_id"],
                exc,
            )
            writer(
                {
                    "node": "generate_cover",
                    "status": "cover_skipped",
                    "message": "Cover image skipped: Imagen requires a paid API plan.",
                }
            )
            return {"cover_image": None}
        raise  # re-raise transient errors so LangGraph can handle them

    encoded = base64.b64encode(_first_image_bytes(response)).decode("utf-8")

    writer(
        {
            "node": "generate_cover",
            "status": "cover_generated",
            "message": "Story cover image generated.",
        }
    )
    logger.info("cover.done story_id=%s", state["story_id"])

    return {"cover_image": encoded}
