"""
api/main.py — FastAPI application entry point.

Handles the REST interface for story generation, lifecycle management,
and real-time status streaming via SSE.
"""

import logging
import logging.config
import base64
import asyncio
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response
from sqlalchemy import text

from api.schemas import (
    HealthResponse,
    StoryRequest,
    StoryResponse,
    StoryStatusResponse,
    ListenResponse,
    StoryListResponse,
    StorySummary,
    StoryOutlineOut,
    CoverExistsResponse,
)
from api.dependencies import get_story_service
from background import active_task_count, shutdown_background_tasks
from pipeline_runner import close_runner_graph, init_runner_graph
from services.story_service import StoryService
from config import settings
from storage.db import Base, async_engine
from story_events import story_event_broker



def _configure_logging() -> None:
    """Configure structured JSON logging for production; plain text for dev."""
    fmt = "%(asctime)s %(levelname)s %(name)s %(message)s"
    if settings.is_production:
        try:
            from pythonjsonlogger import jsonlogger  # type: ignore

            handler = logging.StreamHandler()
            handler.setFormatter(jsonlogger.JsonFormatter(fmt))
            logging.basicConfig(level=settings.app_log_level, handlers=[handler])
        except ImportError:
            logging.basicConfig(level=settings.app_log_level, format=fmt)
    else:
        logging.basicConfig(level=settings.app_log_level, format=fmt)


_configure_logging()
logger = logging.getLogger(__name__)


async def _initialize_database() -> None:
    """Initialize DB connectivity with retry/backoff and clear diagnostics."""
    retries = max(1, settings.db_startup_retries)
    base_delay = max(0.1, settings.db_startup_retry_delay_seconds)

    for attempt in range(1, retries + 1):
        try:
            async with async_engine.begin() as conn:
                # Development convenience only; use Alembic in production.
                if settings.app_env == "development":
                    await conn.run_sync(Base.metadata.create_all)
                else:
                    await conn.execute(text("SELECT 1"))
            logger.info("app.db_ready attempts=%s", attempt)
            return
        except Exception as exc:
            if attempt >= retries:
                raise
            delay = base_delay * attempt
            logger.warning(
                "app.db_retry attempt=%s/%s delay=%.1fs error=%s",
                attempt,
                retries,
                delay,
                exc,
            )
            await asyncio.sleep(delay)




@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: initialize DB/client/runner resources.
    Shutdown: gracefully drain background tasks and release resources.
    """
    logger.info("app.startup env=%s", settings.app_env)

    try:
        await _initialize_database()
    except Exception as exc:
        logger.exception("app.db_startup_failed required=%s", settings.db_startup_required)
        if settings.db_startup_required:
            raise
        logger.warning("app.starting_degraded_mode reason=%s", exc)

    # Shared outbound client to reuse TCP connections for TTS bridge calls.
    app.state.tts_http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=10.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    )
    logger.info("app.http_client_ready")

    await init_runner_graph()
    logger.info("app.runner_graph_ready checkpoint_db=%s", settings.checkpoint_sqlite_path)

    yield  # Application runs here

    logger.info("app.shutdown_begin active_background_tasks=%s", active_task_count())
    await shutdown_background_tasks()

    await close_runner_graph()

    client = getattr(app.state, "tts_http_client", None)
    if client is not None:
        await client.aclose()

    await async_engine.dispose()
    logger.info("app.shutdown db_engine_disposed")




app = FastAPI(
    title="AI Storytelling API",
    description="Generate AI-written stories with voice-over narration.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ──────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("api.unhandled_exception path=%s", request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


@app.post(
    "/stories/{story_id}/listen",
    response_model=ListenResponse,
    summary="Initialize Live Narration",
    description="Orchestrate with TTS service to create a live listening session for a story.",
    tags=["stories"],
)
async def listen_to_story(
    story_id: str,
    user_id: str | None = None,
    service: StoryService = Depends(get_story_service),
):
    """Bridge call to the TTS service to initialize a session."""
    session_data = await service.create_tts_session(story_id, user_id)
    return session_data


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check() -> HealthResponse:
    """
    Liveness check.
    """
    return HealthResponse(status="ok", environment=settings.app_env)




@app.post(
    "/stories/generate",
    response_model=StoryResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a new story generation job",
    tags=["stories"],
)
async def generate_story(
    request: StoryRequest,
    service: StoryService = Depends(get_story_service),
) -> StoryResponse:
    """
    Kicks off an asynchronous LangGraph story generation pipeline.
    Returns immediately with a 'queued' status.
    """
    story = await service.create_story(request.model_dump())
    return StoryResponse(story_id=story.id, status=story.status)


@app.get(
    "/stories/{story_id}",
    response_model=StoryStatusResponse,
    summary="Get story status and outputs",
    tags=["stories"],
)
async def get_story(
    story_id: str,
    service: StoryService = Depends(get_story_service),
) -> StoryStatusResponse:
    """
    Retrieve the current status, outline, script, and download URLs.
    """
    result = await service.get_story_status(story_id)
    story = result["story"]

    # Map internal outline JSON to serialized response schema
    outline_out = None
    if story.outline_json:
        outline_out = StoryOutlineOut.model_validate(story.outline_json)

    return StoryStatusResponse(
        story_id=story.id,
        topic=story.topic,
        tone=story.tone,
        audience=story.audience,
        length=story.length,
        status=story.status,
        outline=outline_out,
        draft_script=story.draft_script,
        cover_image=story.cover_image,
        error=story.error,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


@app.get(
    "/stories/{story_id}/cover",
    summary="Get generated story cover image",
    tags=["stories"],
)
async def get_story_cover(
    story_id: str,
    service: StoryService = Depends(get_story_service),
) -> Response:
    """Return the decoded cover image bytes for a generated story.

    Dual-format note:
    - GET /stories/{id}          → cover_image field is a base64-encoded string (JSON)
    - GET /stories/{id}/cover    → returns raw binary PNG bytes (Content-Type: image/png)

    Use this endpoint when you want to render the image directly (e.g. <img> src,
    file download). Use the JSON field when you need to embed in an API response
    or store the string yourself.
    """
    result = await service.get_story_status(story_id)
    story = result["story"]

    if not story.cover_image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Story '{story_id}' has no generated cover image.",
        )

    try:
        image_bytes = base64.b64decode(story.cover_image)
    except Exception as exc:
        logger.error("api.cover_decode_failed story_id=%s error=%s", story_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stored cover image data is invalid.",
        ) from exc

    return Response(content=image_bytes, media_type="image/png")


@app.get(
    "/stories/{story_id}/cover/exists",
    response_model=CoverExistsResponse,
    summary="Check whether a cover image has been generated",
    tags=["stories"],
)
async def story_cover_exists(
    story_id: str,
    service: StoryService = Depends(get_story_service),
) -> CoverExistsResponse:
    """
    Lightweight check for cover availability — no image bytes are transferred.

    Use this to decide whether to show a placeholder or fetch the real cover
    before making the heavier GET /stories/{id}/cover request.
    """
    result = await service.get_story_status(story_id)
    story = result["story"]
    has_cover = bool(story.cover_image)
    return CoverExistsResponse(
        story_id=story_id,
        has_cover=has_cover,
        cover_url=f"/stories/{story_id}/cover" if has_cover else None,
    )


@app.patch(
    "/stories/{story_id}/outline",
    response_model=StoryStatusResponse,
    summary="Update a story outline",
    tags=["stories"],
)
async def update_story_outline(
    story_id: str,
    outline: StoryOutlineOut,
    service: StoryService = Depends(get_story_service),
) -> StoryStatusResponse:
    """
    Update the outline for a story. Typically called after the 'plan_story'
    node completes but before generation begins (if approval is enabled).
    """
    # Delegate to service
    await service.update_outline(story_id, outline.model_dump())
    
    # Return updated story
    return await get_story(story_id, service=service)




@app.get(
    "/stories/{story_id}/events",
    summary="Stream story generation progress (SSE)",
    tags=["stories"],
)
async def story_events(
    story_id: str,
    service: StoryService = Depends(get_story_service),
):
    """
    Server-Sent Events (SSE) endpoint that streams live progress updates for a
    specific story generation job from the in-process LangGraph runner stream.
    """
    async def event_generator():
        import asyncio
        import json
        import time

        deadline = time.monotonic() + (30 * 60)

        # Send the current DB-backed status immediately on connect.
        try:
            status_data = await service.get_story_status(story_id)
            story = status_data["story"]
            
            # Yield initial status
            initial_data = {
                "story_id": story.id,
                "status": story.status,
                "topic": story.topic
            }
            yield f"data: {json.dumps(initial_data)}\n\n"
            
            # If terminal-ish from client perspective, terminate immediately.
            # awaiting_approval means human action is now required.
            if story.status in ("completed", "failed", "awaiting_approval"):
                logger.info("api.sse_immediate_close story_id=%s status=%s", story_id, story.status)
                return

        except Exception as exc:
            logger.error("api.sse_initial_check_failed story_id=%s error=%s", story_id, exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            return

        try:
            async with story_event_broker.subscribe(story_id) as queue:
                while time.monotonic() < deadline:
                    timeout = max(0.0, deadline - time.monotonic())
                    event = await asyncio.wait_for(queue.get(), timeout=timeout)
                    yield f"data: {json.dumps(event)}\n\n"

                    if event.get("status") in ("completed", "failed", "awaiting_approval"):
                        logger.info("api.sse_closing story_id=%s status=%s", story_id, event.get("status"))
                        break
        except TimeoutError:
            logger.info("api.sse_timeout story_id=%s", story_id)
        except asyncio.CancelledError:
            logger.info("api.sse_client_disconnected story_id=%s", story_id)
            raise
        except Exception as exc:
            logger.error("api.sse_error story_id=%s error=%s", story_id, exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post(
    "/stories/{story_id}/approve",
    response_model=StoryStatusResponse,
    summary="Approve a story and start generation",
    tags=["stories"],
)
async def approve_story(
    story_id: str,
    service: StoryService = Depends(get_story_service),
) -> StoryStatusResponse:
    """
    Mark a story as approved and trigger the chapter generation phase.
    Usually called after the user is happy with the outline (via PATCH).
    """
    await service.approve_story(story_id)
    return await get_story(story_id, service=service)


@app.get(
    "/stories/",
    response_model=StoryListResponse,
    summary="List all story jobs",
    tags=["stories"],
)
async def list_all_stories(
    limit: int = 50,
    offset: int = 0,
    service: StoryService = Depends(get_story_service),
) -> StoryListResponse:
    """
    Returns a paginated list of all stories, ordered by most recent first.
    Useful for displaying a history of generated scripts.
    """
    stories, total = await service.list_history(limit=limit, offset=offset)
    summaries = [
        StorySummary(
            story_id=s.id,
            topic=s.topic,
            status=s.status,
            created_at=s.created_at,
        )
        for s in stories
    ]
    return StoryListResponse(stories=summaries, total=total)


@app.post(
    "/stories/ideate/random",
    summary="Generate a random story seed",
    tags=["stories"],
)
async def randomize_idea():
    """Returns a random high-level story concept."""
    # In a real app, this would call an LLM with a specific prompt
    import random
    seeds = [
         "A clockmaker discovers a key to the stars inside a pocket watch that has stopped for a century.",
         "In a world where shadows can be traded, a young girl loses hers to a traveling merchant.",
         "The last librarian in a sunken city must find a way to preserve the archives of the surface world.",
         "A chef discovers that different spices can evoke specific memories in those who taste them.",
    ]
    return {"idea": random.choice(seeds)}


@app.post(
    "/stories/ideate/expand",
    summary="Expand a story seed into a rich premise",
    tags=["stories"],
)
async def expand_idea(request: dict):
    """Takes a short seed and returns a more detailed narrative expansion."""
    # Mocking expansion logic
    seed = request.get("seed", "")
    if not seed:
        raise HTTPException(status_code=400, detail="Seed is required")
    
    return {
        "expansion": f"{seed} As the narrative unfolds, we discover that this is merely the beginning of a much larger journey involving hidden truths and ancient magic."
    }


@app.delete(
    "/stories/{story_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a story job and its files",
    tags=["stories"],
)
async def delete_existing_story(
    story_id: str,
    service: StoryService = Depends(get_story_service),
):
    """
    Permanently deletes a story from the database and removes its
    generated script file from MinIO/S3.
    """
    deleted = await service.delete_story(story_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Story '{story_id}' not found.",
        )
    return
