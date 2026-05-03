"""
background.py — In-process background task helper.

Runs async workloads inside the API process with a small concurrency limit.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable

logger = logging.getLogger(__name__)


_MAX_CONCURRENCY = max(1, int(os.getenv("LOCAL_TASK_CONCURRENCY", "1")))
_SEMAPHORE = asyncio.Semaphore(_MAX_CONCURRENCY)
_ACTIVE_TASKS: set[asyncio.Task] = set()


def active_task_count() -> int:
    """Return the number of currently tracked background tasks."""
    return sum(1 for task in _ACTIVE_TASKS if not task.done())


def _log_task_result(task: asyncio.Task) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        logger.warning("background.task_cancelled name=%s", task.get_name())
    except Exception as exc:
        logger.exception("background.task_failed name=%s error=%s", task.get_name(), exc)


def submit_background_task(coro: Awaitable, *, name: str | None = None) -> asyncio.Task:
    async def _runner():
        async with _SEMAPHORE:
            await coro

    task = asyncio.create_task(_runner(), name=name)
    _ACTIVE_TASKS.add(task)
    task.add_done_callback(_ACTIVE_TASKS.discard)
    task.add_done_callback(_log_task_result)
    return task


async def shutdown_background_tasks(timeout_seconds: float = 15.0) -> None:
    """Cancel and await all in-flight background tasks during app shutdown."""
    pending = [task for task in _ACTIVE_TASKS if not task.done()]
    if not pending:
        return

    logger.info("background.shutdown_begin pending=%s", len(pending))
    for task in pending:
        task.cancel()

    done, still_pending = await asyncio.wait(pending, timeout=timeout_seconds)
    for task in done:
        _log_task_result(task)

    if still_pending:
        logger.warning(
            "background.shutdown_timeout still_pending=%s timeout_seconds=%s",
            len(still_pending),
            timeout_seconds,
        )
    else:
        logger.info("background.shutdown_complete")
