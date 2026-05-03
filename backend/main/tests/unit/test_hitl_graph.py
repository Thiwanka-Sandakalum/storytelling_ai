"""
tests/unit/test_hitl_graph.py — HITL graph integration tests.

Uses the LangGraph docs-recommended approach:
  - MemorySaver checkpointer (no real DB needed)
  - aupdate_state(..., as_node="plan_story") to inject planned state,
    bypassing the real LLM plan_story call
  - ainvoke(None, config) to exercise the await_approval gate
  - Command(resume=...) to exercise the resume path
  - interrupt_before=["generate_chapter"] to stop before any real LLM call
"""
import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from graph.pipeline import build_graph


# ── Helpers ──────────────────────────────────────────────────────────────────

def _mock_outline() -> dict:
    return {
        "hook": "A gripping opening hook.",
        "chapters": [
            {
                "title": "Chapter 1",
                "description": "The first chapter.",
                "chapter_index": 0,
                "sections": [
                    {
                        "title": "Intro",
                        "description": "Opening scene.",
                        "index": 0,
                        "chapter_index": 0,
                        "chapter_title": "Chapter 1",
                        "content": None,
                    }
                ],
            }
        ],
        "climax": "The climax.",
        "closing": "The end.",
        "target_words": 200,
        "target_minutes": 2,
    }


def _base_state(*, require_approval: bool) -> dict:
    return {
        "story_id": "hitl-test-story",
        "topic": "test topic",
        "tone": "educational",
        "audience": "general audience",
        "length": "short",
        "user_prefs": {"require_approval": require_approval},
        "outline": _mock_outline(),
        "sections_done": [],
        "draft_script": None,
        "script_path": None,
        "cover_image": None,
        "retry_count": 0,
        "error": None,
    }


def _fresh_graph():
    """Each test gets its own MemorySaver so threads don't bleed across tests."""
    return build_graph().compile(checkpointer=MemorySaver())


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_await_approval_pauses_when_required() -> None:
    """
    With require_approval=True the graph halts at await_approval and
    surfaces the outline as an interrupt payload.
    """
    config = {"configurable": {"thread_id": "hitl-pause"}}
    graph = _fresh_graph()

    # Inject state as if plan_story just finished — skip the real LLM call.
    await graph.aupdate_state(config, _base_state(require_approval=True), as_node="plan_story")

    # Running forward should hit interrupt() and return with __interrupt__ key.
    result = await graph.ainvoke(None, config)

    assert "__interrupt__" in result, "Expected graph to pause at await_approval"
    interrupts = result["__interrupt__"]
    assert len(interrupts) >= 1
    payload = interrupts[0].value
    assert "outline" in payload, f"Interrupt payload missing 'outline': {payload}"
    assert "chapters" in payload["outline"]


@pytest.mark.anyio
async def test_await_approval_passthrough_when_not_required() -> None:
    """
    With require_approval=False the approval gate is a no-op.
    No interrupt fires and execution advances past await_approval.
    """
    config = {"configurable": {"thread_id": "hitl-passthrough"}}
    graph = _fresh_graph()

    await graph.aupdate_state(config, _base_state(require_approval=False), as_node="plan_story")

    # Stop before generate_chapter so we don't call the real LLM.
    result = await graph.ainvoke(None, config, interrupt_before=["generate_chapter"])

    assert "__interrupt__" not in result, (
        "Expected no interrupt when require_approval=False"
    )


@pytest.mark.anyio
async def test_await_approval_resume_keeps_outline_when_approved_with_true() -> None:
    """
    Resuming with True (simple approval) keeps the original outline intact.
    """
    config = {"configurable": {"thread_id": "hitl-resume-true"}}
    graph = _fresh_graph()
    original_outline = _mock_outline()

    await graph.aupdate_state(config, _base_state(require_approval=True), as_node="plan_story")
    await graph.ainvoke(None, config)  # pauses at interrupt

    # Resume: True = approved as-is
    result = await graph.ainvoke(
        Command(resume=True),
        config,
        interrupt_before=["generate_chapter"],
    )

    assert "__interrupt__" not in result
    assert result.get("outline") == original_outline


@pytest.mark.anyio
async def test_await_approval_resume_applies_edited_outline() -> None:
    """
    Resuming with a modified outline dict replaces the stored outline.
    """
    config = {"configurable": {"thread_id": "hitl-resume-edit"}}
    graph = _fresh_graph()
    edited_outline = _mock_outline()
    edited_outline["hook"] = "EDITED HOOK"
    edited_outline["chapters"][0]["title"] = "Edited Chapter"

    await graph.aupdate_state(config, _base_state(require_approval=True), as_node="plan_story")
    await graph.ainvoke(None, config)  # pauses at interrupt

    result = await graph.ainvoke(
        Command(resume=edited_outline),
        config,
        interrupt_before=["generate_chapter"],
    )

    assert "__interrupt__" not in result
    assert result["outline"]["hook"] == "EDITED HOOK"
    assert result["outline"]["chapters"][0]["title"] == "Edited Chapter"


@pytest.mark.anyio
async def test_checkpoint_is_preserved_between_runs() -> None:
    """
    After the initial run pauses, aget_state reports the story is next at
    await_approval (i.e. the checkpoint is saved and has a pending next step).
    """
    config = {"configurable": {"thread_id": "hitl-checkpoint"}}
    graph = _fresh_graph()

    await graph.aupdate_state(config, _base_state(require_approval=True), as_node="plan_story")
    await graph.ainvoke(None, config)  # pauses at interrupt

    snapshot = await graph.aget_state(config)
    # snapshot.next lists the nodes that will run on the next resume
    assert snapshot is not None
    assert "await_approval" in snapshot.next or len(snapshot.next) > 0
