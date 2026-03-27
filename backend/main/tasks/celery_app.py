"""
tasks/celery_app.py — Background worker tasks.

Handles long-running LangGraph pipeline execution and event publishing.
The Celery worker runs in a separate process from the FastAPI server.
It invokes the compiled LangGraph pipeline synchronously and persists
all results (including error states) to PostgreSQL.

Usage:
    # Start a worker
    celery -A tasks.celery_app worker --loglevel=info --concurrency=4
"""

import asyncio
import logging
import os
import sys

# Ensure the project root (backend/main) is in the python path
# We use the absolute path of this file to find the root
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from celery import Celery

from config import settings

logger = logging.getLogger(__name__)

# ── Celery application ────────────────────────────────────────
# Upstash (rediss://) requires ssl_cert_reqs in the URL for the Celery
# Redis backend. Append it if not already present.
def _celery_redis_url(url: str) -> str:
    if url.startswith("rediss://") and "ssl_cert_reqs" not in url:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}ssl_cert_reqs=CERT_NONE"
    return url

_redis_url = _celery_redis_url(settings.redis_url)

celery_app = Celery(
    "storytelling",
    broker=_redis_url,
    backend=_redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,          # Acknowledge only after completion (safer)
    worker_prefetch_multiplier=1, # One task at a time per worker (LLM calls are heavy)
    task_soft_time_limit=600,     # 10-minute soft limit per task
    task_time_limit=660,          # 11-minute hard kill limit
)

# Upstash uses TLS (rediss://) — configure SSL for both broker and backend.
if settings.redis_url.startswith("rediss://"):
    _ssl_config = {"ssl_cert_reqs": None}  # Upstash uses valid certs; None = no client cert
    celery_app.conf.broker_use_ssl = _ssl_config
    celery_app.conf.redis_backend_use_ssl = _ssl_config


# ── Main task ─────────────────────────────────────────────────

@celery_app.task(
    bind=True, 
    name="tasks.run_story_pipeline", 
    max_retries=3,
    default_retry_delay=30,      # 30 seconds between retries
    retry_backoff=True          # Exponential backoff
)
def run_story_pipeline(self, state: dict) -> dict:
    """
    Celery task — orchestrates the full LangGraph story pipeline.
    Runs the entire process in a single asyncio loop to ensure DB session consistency.
    """
    # Reinforce path for child workers
    if ROOT_DIR not in sys.path:
        sys.path.insert(0, ROOT_DIR)

    # Imports inside task to avoid circularity
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from graph.pipeline import compiled_graph
    from storage.db import build_engine
    from repositories.story_repo import StoryRepository

    story_id: str = state["story_id"]
    logger.info("pipeline.task_start story_id=%s", story_id)

    # Map graph nodes to user-friendly statuses for the DB
    NODE_STATUS_MAP = {
        "plan_story": "planning",
        "generate_section": "generating",
        "assemble_story": "assembling",
    }

    async def _execute_pipeline():
        import json
        import redis.asyncio as redis

        # Create loop-local engine and session factory to avoid loop conflict
        engine = build_engine()
        session_factory = async_sessionmaker(
            bind=engine,
            expire_on_commit=False,
            class_=AsyncSession,
        )

        async with session_factory() as session:
            repo = StoryRepository(session)
            
            # 0. Connect to Redis for event publishing
            r = redis.from_url(settings.redis_url)
            
            async def _publish(msg_dict: dict):
                await r.publish(f"story_events:{story_id}", json.dumps(msg_dict))

            # 1. Initial processing status
            await repo.update(story_id, {"status": "processing"})
            await _publish({"status": "processing", "node": "start"})

            try:
                # 2. Stream the LangGraph pipeline
                final_state = state
                
                for event in compiled_graph.stream(state, stream_mode="updates"):
                    for node_name, node_output in event.items():
                        final_state.update(node_output)

                        new_status = NODE_STATUS_MAP.get(node_name, "processing")
                        db_updates = {"status": new_status}
                        event_data = {"status": new_status, "node": node_name}
                        
                        if node_name == "plan_story":
                            db_updates["outline_json"] = node_output.get("outline")
                            event_data["outline"] = node_output.get("outline")
                        
                        if node_name == "assemble_story":
                            db_updates["draft_script"] = node_output.get("draft_script")

                        if node_name == "generate_chapter":
                            event_data["progress"] = "chapter_done"

                        await repo.update(story_id, db_updates)
                        await _publish(event_data)
                        logger.info("pipeline.stage_done story_id=%s node=%s status=%s", 
                                    story_id, node_name, new_status)

                # 4. Final completion
                final_payload = {
                    "status": "completed",
                    "outline_json": final_state.get("outline"),
                    "draft_script": final_state.get("draft_script"),
                    "error": None,
                }
                await repo.update(story_id, final_payload)
                await _publish(final_payload)
                
                logger.info("pipeline.task_done story_id=%s", story_id)
                return final_state

            except Exception as exc:
                error_msg = f"{type(exc).__name__}: {exc}"
                logger.exception("pipeline.task_failed story_id=%s error=%s", story_id, error_msg)
                await repo.update(story_id, {"status": "failed", "error": error_msg})
                # Attempt to publish failure
                try:
                    await _publish({"status": "failed", "error": error_msg})
                except:
                    pass
                raise
            finally:
                # Ensure engine is disposed when task completes
                await engine.dispose()

    # Run the entire async flow in one loop
    return asyncio.run(_execute_pipeline())
