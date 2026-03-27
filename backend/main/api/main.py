"""
api/main.py — FastAPI application entry point.

Handles the REST interface for story generation, lifecycle management,
and real-time status streaming via SSE.
"""

import logging
import logging.config
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from api.schemas import (
    HealthResponse,
    StoryRequest,
    StoryResponse,
    StoryStatusResponse,
    ListenResponse,
    StoryListResponse,
    StorySummary,
    StoryOutlineOut,
    StorySectionOut,
)
from api.dependencies import get_story_service
from services.story_service import StoryService
from config import settings
from storage.db import Base, async_engine



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




@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: create DB tables and ensure S3 bucket exists.
    Shutdown: dispose the DB engine connection pool.
    """
    logger.info("app.startup env=%s", settings.app_env)

    # Create tables if they don't exist (Alembic handles migrations in prod)
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("app.db_tables_ready")

    yield  # Application runs here

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
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ──────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
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
    return HealthResponse(status="ok")




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
        outline_out = StoryOutlineOut(**story.outline_json)

    return StoryStatusResponse(
        story_id=story.id,
        topic=story.topic,
        tone=story.tone,
        audience=story.audience,
        length=story.length,
        status=story.status,
        outline=outline_out,
        draft_script=story.draft_script,
        error=story.error,
        created_at=story.created_at,
        updated_at=story.updated_at,
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
    Server-Sent Events (SSE) endpoint that streams progress updates for a
    specific story generation job by polling the database.
    """
    async def event_generator():
        import asyncio
        import json
        import time

        poll_interval = 1.5
        deadline = time.monotonic() + (30 * 60)
        last_updated_at = None

        # 1. Check current status in DB first
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
            
            # If already finished, terminate immediately
            if story.status in ("completed", "failed"):
                logger.info("api.sse_immediate_close story_id=%s status=%s", story_id, story.status)
                return

        except Exception as exc:
            logger.error("api.sse_initial_check_failed story_id=%s error=%s", story_id, exc)

        try:
            while time.monotonic() < deadline:
                await asyncio.sleep(poll_interval)

                status_data = await service.get_story_status(story_id)
                story = status_data["story"]

                if last_updated_at != story.updated_at:
                    last_updated_at = story.updated_at
                    data = {
                        "story_id": story.id,
                        "status": story.status,
                        "topic": story.topic,
                        "updated_at": story.updated_at.isoformat(),
                    }
                    yield f"data: {json.dumps(data)}\n\n"

                if story.status in ("completed", "failed"):
                    logger.info("api.sse_closing story_id=%s status=%s", story_id, story.status)
                    break
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
