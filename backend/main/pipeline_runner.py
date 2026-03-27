"""
pipeline_runner.py — Async story pipeline runner (no Celery/Redis).
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from graph.pipeline import compiled_graph
from repositories.story_repo import StoryRepository
from storage.db import build_engine

logger = logging.getLogger(__name__)


NODE_STATUS_MAP = {
    "plan_story": "planning",
    "generate_section": "generating",
    "assemble_story": "assembling",
}


async def run_story_pipeline_async(state: dict[str, Any]) -> dict[str, Any]:
    story_id = state["story_id"]
    logger.info("pipeline.task_start story_id=%s", story_id)

    engine = build_engine()
    session_factory = async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )

    try:
        async with session_factory() as session:
            repo = StoryRepository(session)

            # 1. Initial processing status
            await repo.update(story_id, {"status": "processing"})

            try:
                # 2. Stream the LangGraph pipeline
                final_state = state

                for event in compiled_graph.stream(state, stream_mode="updates"):
                    for node_name, node_output in event.items():
                        final_state.update(node_output)

                        new_status = NODE_STATUS_MAP.get(node_name, "processing")
                        db_updates: dict[str, Any] = {"status": new_status}

                        if node_name == "plan_story":
                            db_updates["outline_json"] = node_output.get("outline")

                        if node_name == "assemble_story":
                            db_updates["draft_script"] = node_output.get("draft_script")

                        await repo.update(story_id, db_updates)
                        logger.info(
                            "pipeline.stage_done story_id=%s node=%s status=%s",
                            story_id,
                            node_name,
                            new_status,
                        )

                # 3. Final completion
                final_payload = {
                    "status": "completed",
                    "outline_json": final_state.get("outline"),
                    "draft_script": final_state.get("draft_script"),
                    "error": None,
                }
                await repo.update(story_id, final_payload)

                logger.info("pipeline.task_done story_id=%s", story_id)
                return final_state

            except Exception as exc:
                error_msg = f"{type(exc).__name__}: {exc}"
                logger.exception(
                    "pipeline.task_failed story_id=%s error=%s", story_id, error_msg
                )
                await repo.update(story_id, {"status": "failed", "error": error_msg})
                raise
    finally:
        await engine.dispose()
