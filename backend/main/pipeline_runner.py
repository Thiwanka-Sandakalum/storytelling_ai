"""
pipeline_runner.py — Async story pipeline runner (no Celery/Redis).
"""

from __future__ import annotations

from contextlib import AsyncExitStack
import logging
from typing import Any, cast

from langgraph.cache.sqlite import SqliteCache  # type: ignore[reportMissingImports]
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver  # type: ignore[reportMissingImports]

from config import settings
from graph.pipeline import build_graph
from repositories.story_repo import StoryRepository
from storage.db import AsyncSessionFactory
from story_events import story_event_broker

logger = logging.getLogger(__name__)


class ResumeStateMissingError(RuntimeError):
    """Raised when a paused run cannot be resumed due to missing checkpoint state."""

_runner_graph = None
_runner_graph_lock = None
_runner_graph_stack = AsyncExitStack()
_runner_cache = SqliteCache(path=settings.graph_cache_sqlite_path)


NODE_STATUS_MAP = {
    "plan_story": "planning",
    "await_approval": "awaiting_approval",
    "generate_chapter": "generating",
    "assemble_story": "assembling",
    "generate_cover": "cover_generating",
}


def _get_runner_graph_lock():
    global _runner_graph_lock
    if _runner_graph_lock is None:
        import asyncio

        _runner_graph_lock = asyncio.Lock()
    return _runner_graph_lock


async def init_runner_graph() -> None:
    """Initialize the standalone runner graph with a durable SQLite checkpointer."""
    global _runner_graph
    lock = _get_runner_graph_lock()
    async with lock:
        if _runner_graph is not None:
            return

        checkpointer = await _runner_graph_stack.enter_async_context(
            AsyncSqliteSaver.from_conn_string(settings.checkpoint_sqlite_path)
        )
        _runner_graph = build_graph().compile(
            checkpointer=checkpointer,
            cache=_runner_cache,
        )


async def close_runner_graph() -> None:
    """Release the durable runner graph checkpointer resources."""
    global _runner_graph
    lock = _get_runner_graph_lock()
    async with lock:
        await _runner_graph_stack.aclose()
        _runner_graph = None


async def _get_runner_graph():
    await init_runner_graph()
    return _runner_graph


async def has_resume_checkpoint(story_id: str) -> bool:
    """Return True when a saved checkpoint exists for the story thread."""
    config = {"configurable": {"thread_id": story_id}}
    graph = cast(Any, await _get_runner_graph())
    snapshot = await graph.aget_state(config)
    if snapshot is None:
        return False
    return bool(snapshot.next or snapshot.values)


async def _load_story(story_id: str):
    """Load a story using a short-lived session borrowed from the pool."""
    async with AsyncSessionFactory() as session:
        repo = StoryRepository(session)
        return await repo.get_by_id(story_id)


async def _update_story(story_id: str, updates: dict[str, Any]) -> None:
    """Persist story updates using a short-lived pooled session."""
    async with AsyncSessionFactory() as session:
        repo = StoryRepository(session)
        await repo.update(story_id, updates)


def _normalize_stream_part(part: Any) -> dict[str, Any]:
    """Normalize LangGraph stream chunks to a dict shape.

    When ``stream_mode`` is a list, LangGraph yields tuples such as
    ``(mode, payload)`` or ``(namespace, mode, payload)`` instead of the
    dict-shaped chunks produced for single-mode streams.
    """
    if isinstance(part, dict):
        return part

    if isinstance(part, tuple):
        if len(part) == 2:
            mode, payload = part
            return {"type": mode, "ns": (), "data": payload}

        if len(part) == 3:
            namespace, mode, payload = part
            return {"type": mode, "ns": namespace, "data": payload}

    raise TypeError(
        f"Unexpected LangGraph stream chunk shape: {type(part).__name__}"
    )


def _get_interrupts_from_stream_part(part: dict[str, Any]) -> tuple[Any, ...]:
    """Extract interrupt payloads from stream chunks.

    Primary (v2): ``{"type": "values", "interrupts": (...)}``.
    Compatibility path observed in some streams: interrupts appear under
    ``{"type": "updates", "data": {"__interrupt__": (...)}}``.
    """
    part_type = part.get("type")

    if part_type == "values":
        interrupts = part.get("interrupts")
        if interrupts:
            return tuple(interrupts)

    if part_type == "updates":
        raw_data = part.get("data")
        if isinstance(raw_data, dict):
            compat_interrupts = raw_data.get("__interrupt__")
            if compat_interrupts:
                return tuple(compat_interrupts)

    return ()


def _get_update_entries_from_stream_part(
    part: dict[str, Any],
) -> tuple[tuple[str, dict[str, Any]], ...]:
    """Return safe (node_name, node_output) entries from an updates stream part.

    LangGraph may emit internal or library-version-specific update payloads that
    are not plain ``dict[str, dict]``. We skip those defensively to keep the
    runner resilient.
    """
    if part.get("type") != "updates":
        return ()

    raw_data = part.get("data")
    if not isinstance(raw_data, dict):
        return ()

    entries: list[tuple[str, dict[str, Any]]] = []
    for node_name, node_output in raw_data.items():
        if not isinstance(node_name, str):
            continue
        if not isinstance(node_output, dict):
            continue
        entries.append((node_name, node_output))

    return tuple(entries)


def _describe_updates_payload(part: dict[str, Any]) -> str:
    """Return a compact diagnostics string for unexpected updates payloads."""
    raw_data = part.get("data")
    if not isinstance(raw_data, dict):
        return f"data_type={type(raw_data).__name__}"

    parts: list[str] = []
    for key, value in raw_data.items():
        parts.append(f"{key}:{type(value).__name__}")
    return "data_type=dict entries=" + ",".join(parts)


async def _stream_pipeline(
    input_: Any,
    config: dict,
    story_id: str,
    initial_state: dict | None = None,
) -> dict[str, Any]:
    """
    Shared streaming loop for both initial runs and resumes.

    Returns the accumulated final_state dict.
    If a v2 values stream part contains interrupts, the DB is set to
    ``awaiting_approval`` and the function returns early (not an error).
    """
    final_state: dict[str, Any] = dict(initial_state or {})
    graph = cast(Any, await _get_runner_graph())

    async for part in graph.astream(
        input_,
        config,
        stream_mode=["updates", "values", "custom"],
        version="v2",
    ):
        normalized_part = _normalize_stream_part(part)

        interrupts = _get_interrupts_from_stream_part(normalized_part)
        if interrupts:
            await _update_story(story_id, {"status": "awaiting_approval"})
            await story_event_broker.publish(
                story_id,
                {
                    "story_id": story_id,
                    "status": "awaiting_approval",
                    "node": "await_approval",
                },
            )
            logger.info("pipeline.awaiting_approval story_id=%s", story_id)
            return final_state

        part_type = normalized_part.get("type")

        # ── Native in-node progress events ──────────────────────────────────
        if part_type == "custom":
            raw_payload = normalized_part.get("data")
            if isinstance(raw_payload, dict):
                payload: dict = dict(raw_payload)
            else:
                logger.warning(
                    "pipeline.custom_payload_non_dict story_id=%s payload_type=%s",
                    story_id,
                    type(raw_payload).__name__,
                )
                payload = {
                    "node": "custom",
                    "message": str(raw_payload),
                }
            payload.setdefault("story_id", story_id)
            await story_event_broker.publish(story_id, payload)
            continue

        # Keep a rolling best-known state snapshot.
        if part_type == "values":
            values_data = normalized_part.get("data")
            if isinstance(values_data, dict):
                final_state.update(values_data)
            continue

        if part_type != "updates":
            continue

        updates = _get_update_entries_from_stream_part(normalized_part)
        if not updates:
            logger.warning(
                "pipeline.updates_payload_skipped story_id=%s %s",
                story_id,
                _describe_updates_payload(normalized_part),
            )
            continue

        for node_name, node_output in updates:
            # ── Normal node output ────────────────────────────────────────────
            final_state.update(node_output)

            # await_approval is a pass-through node unless interrupt() fires.
            # The actual pause status is handled above via values.interrupts.
            if node_name == "await_approval":
                if node_output.get("outline"):
                    await _update_story(story_id, {"outline_json": node_output["outline"]})
                continue

            new_status = NODE_STATUS_MAP.get(node_name, "processing")
            db_updates: dict[str, Any] = {"status": new_status}

            if node_name == "plan_story":
                db_updates["outline_json"] = node_output.get("outline")

            if node_name == "assemble_story":
                db_updates["draft_script"] = node_output.get("draft_script")

            if node_name == "generate_cover":
                db_updates["cover_image"] = node_output.get("cover_image")

            await _update_story(story_id, db_updates)
            await story_event_broker.publish(
                story_id,
                {
                    "story_id": story_id,
                    "status": new_status,
                    "node": node_name,
                },
            )
            logger.info(
                "pipeline.stage_done story_id=%s node=%s status=%s",
                story_id,
                node_name,
                new_status,
            )

    return final_state


async def _mark_story_failed_safe(story_id: str, error_msg: str) -> None:
    """Persist failed status using a fresh session to avoid poisoned tx state reuse."""
    try:
        await _update_story(story_id, {"status": "failed", "error": error_msg})
    except Exception:
        logger.exception(
            "pipeline.persist_failed_status_error story_id=%s",
            story_id,
        )


async def run_story_pipeline_async(state: dict[str, Any]) -> dict[str, Any]:
    story_id = state["story_id"]
    # thread_id = story_id ties this run to a unique checkpointer slot so that
    # resume_story_pipeline_async can pick up the exact saved state later.
    config = {"configurable": {"thread_id": story_id}}
    logger.info("pipeline.task_start story_id=%s", story_id)
    await _update_story(story_id, {"status": "processing"})
    await story_event_broker.publish(
        story_id,
        {
            "story_id": story_id,
            "status": "processing",
            "node": "start",
        },
    )
    try:
        final_state = await _stream_pipeline(state, config, story_id, state)

        # Only mark completed if the pipeline ran to the end (no interrupt).
        story = await _load_story(story_id)
        if story is None:
            raise RuntimeError(f"Story '{story_id}' disappeared during pipeline execution.")

        if story.status != "awaiting_approval":
            if not final_state.get("draft_script"):
                raise RuntimeError(
                    "Pipeline finished without draft_script; "
                    "generation/assembly likely did not execute."
                )

            await _update_story(story_id, {
                "status": "completed",
                "outline_json": final_state.get("outline"),
                "draft_script": final_state.get("draft_script"),
                "cover_image": final_state.get("cover_image"),
                "error": None,
            })
            await story_event_broker.publish(
                story_id,
                {
                    "story_id": story_id,
                    "status": "completed",
                    "node": "completed",
                },
            )
            logger.info("pipeline.task_done story_id=%s", story_id)

        return final_state

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception(
            "pipeline.task_failed story_id=%s error=%s", story_id, error_msg
        )
        await _mark_story_failed_safe(story_id, error_msg)
        await story_event_broker.publish(
            story_id,
            {
                "story_id": story_id,
                "status": "failed",
                "error": error_msg,
            },
        )
        raise


async def resume_story_pipeline_async(
    story_id: str, resume_value: Any
) -> dict[str, Any]:
    """
    Resume a pipeline that was paused at an ``interrupt()`` call.

    ``resume_value`` is passed as ``Command(resume=resume_value)`` and becomes
    the return value of ``interrupt()`` inside the ``await_approval`` node.
    Typically this is the (possibly edited) outline dict from the DB.
    """
    from langgraph.types import Command  # local import to keep top-level clean

    # Same thread_id as the original run — checkpointer loads that exact state.
    config = {"configurable": {"thread_id": story_id}}
    logger.info("pipeline.resume_start story_id=%s", story_id)
    if not await has_resume_checkpoint(story_id):
        error_msg = (
            "Cannot resume: pipeline checkpoint not found for this story. "
            "Cause: the API process restarted after the outline was approved "
            "but before generation began, clearing the in-memory SQLite checkpoint. "
            "Resolution: regenerate the story. "
            "Production note: to survive restarts, switch to a durable checkpointer "
            "(e.g. AsyncPostgresSaver) in pipeline_runner.init_runner_graph()."
        )
        await _update_story(story_id, {"status": "failed", "error": error_msg})
        logger.error("pipeline.resume_missing_checkpoint story_id=%s", story_id)
        raise ResumeStateMissingError(error_msg)

    await _update_story(story_id, {"status": "processing"})
    await story_event_broker.publish(
        story_id,
        {
            "story_id": story_id,
            "status": "processing",
            "node": "resume",
        },
    )
    try:
        final_state = await _stream_pipeline(
            Command(resume=resume_value), config, story_id
        )

        story = await _load_story(story_id)
        if story is None:
            raise RuntimeError(f"Story '{story_id}' disappeared during pipeline resume.")

        if story.status != "awaiting_approval":
            if not final_state.get("draft_script"):
                raise RuntimeError(
                    "Pipeline resume finished without draft_script; "
                    "generation/assembly likely did not execute."
                )

            await _update_story(story_id, {
                "status": "completed",
                "draft_script": final_state.get("draft_script"),
                "cover_image": final_state.get("cover_image"),
                "error": None,
            })
            await story_event_broker.publish(
                story_id,
                {
                    "story_id": story_id,
                    "status": "completed",
                    "node": "completed",
                },
            )
            logger.info("pipeline.resume_done story_id=%s", story_id)

        return final_state

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.exception(
            "pipeline.resume_failed story_id=%s error=%s", story_id, error_msg
        )
        await _mark_story_failed_safe(story_id, error_msg)
        await story_event_broker.publish(
            story_id,
            {
                "story_id": story_id,
                "status": "failed",
                "error": error_msg,
            },
        )
        raise
