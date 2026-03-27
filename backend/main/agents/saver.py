"""
agents/saver.py — Script Saver agent node.

Takes the final draft_script and uploads it to object storage (MinIO / S3)
as a plain text file.
"""

import logging

from state.schema import StoryState
from storage.media import upload_bytes
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True
)
def _invoke_upload(path, data, content_type):
    """Internal helper to upload with retries."""
    return upload_bytes(path, data, content_type=content_type)


def save_script(state: StoryState) -> dict:
    """
    LangGraph node — Saver.

    Persists the final draft_script to object storage as a .txt file.
    Returns the storage path for downstream consumers.

    Args:
        state: Current pipeline state (must have ``draft_script`` filled).

    Returns:
        Partial state update: ``{"script_path": str}``
    """
    script = state.get("draft_script")
    if not script:
        raise ValueError("save_script called before draft_script was generated.")

    logger.info(
        "save_script.start story_id=%s script_chars=%d",
        state["story_id"],
        len(script),
    )

    # Encode as UTF-8 bytes for storage
    script_bytes = script.encode("utf-8")

    # Store as .txt
    script_path = f"scripts/{state['story_id']}.txt"
    _invoke_upload(script_path, script_bytes, content_type="text/plain")

    logger.info(
        "save_script.done story_id=%s script_path=%s bytes=%d",
        state["story_id"],
        script_path,
        len(script_bytes),
    )
    return {"script_path": script_path}
