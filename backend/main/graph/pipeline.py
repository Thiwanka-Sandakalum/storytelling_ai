"""
graph/pipeline.py — Story generation pipeline definition.

Orchestrates the flow from planning to chapter generation to script assembly.
"""

import logging
import json

from config import settings
from langgraph.graph import StateGraph, START, END
from langgraph.types import CachePolicy, RetryPolicy, Send, interrupt

from agents.assembler import assemble_story
from agents.cover_artist import generate_cover
from agents.generator import generate_chapter
from agents.planner import plan_story
from state.schema import LENGTH_CONFIG, StoryState

logger = logging.getLogger(__name__)


def _planner_cache_key(state: StoryState) -> str:
    """Build a stable cache key for planner inputs, excluding per-run identifiers."""
    user_prefs = dict(state.get("user_prefs") or {})
    user_prefs.pop("voice", None)
    user_prefs.pop("require_approval", None)

    payload = {
        "topic": state.get("topic"),
        "tone": state.get("tone"),
        "audience": state.get("audience"),
        "length": state.get("length"),
        "user_prefs": user_prefs,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


# ── Human-in-the-loop: outline approval gate ─────────────────────────────────

def await_approval(state: StoryState) -> dict:
    """
    Pauses graph execution for human review of the outline when
    ``user_prefs.require_approval`` is ``True``.

    Via FastAPI:  set ``require_approval=true`` in the POST /stories/generate body.
    Via Studio:   set ``user_prefs: {"require_approval": true}`` in the graph input.

    On resume, ``Command(resume=outline_dict)`` passes the (possibly edited)
    outline back as the return value of ``interrupt()``.

    Rules (per LangGraph docs):
    - ``interrupt()`` must NOT be wrapped in try/except.
    - All code before ``interrupt()`` here is read-only — safe to re-run.
    - The payload must be JSON-serializable.
    """
    user_prefs = state.get("user_prefs") or {}
    if not user_prefs.get("require_approval"):
        return {}  # passthrough — approval not requested for this story

    # Pause execution and surface the outline to the caller.
    # The resume value becomes the return value of interrupt() when resumed.
    resume_value = interrupt({"outline": state["outline"]})

    # Accept an edited outline if the human passed one back; otherwise keep original.
    if isinstance(resume_value, dict) and "chapters" in resume_value:
        logger.info("await_approval.outline_updated story_id=%s", state["story_id"])
        return {"outline": resume_value}

    logger.info("await_approval.accepted_as_is story_id=%s", state["story_id"])
    return {}


# ── Conditional edge: fan-out one worker per chapter ─────────────────────────

def assign_workers(state: StoryState) -> list[Send] | str:
    """
    Reads the planner's chapter tree and dispatches one parallel
    ``generate_chapter`` worker per chapter using LangGraph's Send API.
    """
    outline = state.get("outline")
    if not outline or not outline.get("chapters"):
        logger.warning("pipeline.assign_workers: outline or chapters missing.")
        return END

    cfg          = LENGTH_CONFIG[state["length"]]
    target_words = cfg["words_per"]
    chapters     = outline["chapters"]

    logger.info(
        "pipeline.assign_workers story_id=%s n_chapters=%d sections_per_ch=%d",
        state["story_id"],
        len(chapters),
        len(chapters[0]["sections"]) if chapters else 0,
    )

    return [
        Send(
            "generate_chapter",
            {
                "chapter":       chapter,
                "story_id":      state["story_id"],
                "tone":          state["tone"],
                "audience":      state["audience"],
                "target_words":  target_words,
                "sections_done": [],    # operator.add merges results into main state
            },
        )
        for chapter in chapters
    ] or END


# ── Graph construction ────────────────────────────────────────────────────────

def _build_graph() -> StateGraph:
    builder = StateGraph(StoryState)

    # ── Nodes ─────────────────────────────────────────────────────────────────
    builder.add_node(
        "plan_story",
        plan_story,
        cache_policy=CachePolicy(
            key_func=_planner_cache_key,
            ttl=settings.planner_cache_ttl_seconds,
        ),
        retry_policy=RetryPolicy(max_attempts=3),
    )  # Orchestrator
    builder.add_node("await_approval",   await_approval)    # HITL gate (passthrough when not required)
    builder.add_node(
        "generate_chapter",
        generate_chapter,
        retry_policy=RetryPolicy(max_attempts=3),
    )  # Parallel workers
    builder.add_node("assemble_story",   assemble_story)    # Chapter-aware fan-in
    # No retry_policy here: billing/plan errors are caught inside the node
    # and return gracefully. Transient network errors are rare for image gen.
    builder.add_node("generate_cover", generate_cover)

    # ── Edges ─────────────────────────────────────────────────────────────────
    # 1. START → Planner
    builder.add_edge(START, "plan_story")

    # 2. Planner → HITL gate (passthrough when require_approval is False)
    builder.add_edge("plan_story", "await_approval")

    # 3. HITL gate -> cover generation starts immediately (parallel branch).
    builder.add_edge("await_approval", "generate_cover")

    # 4. HITL gate → parallel workers (Send fan-out, one per chapter).
    #    END is kept as a valid target so that an empty return (missing outline)
    #    terminates the graph gracefully rather than erroring.
    builder.add_conditional_edges("await_approval", assign_workers)

    # 5. Workers -> Assembler (implicit fan-in: waits for all workers to complete)
    builder.add_edge("generate_chapter", "assemble_story")

    # 6. Terminal edges. Graph completes after active branches finish.
    builder.add_edge("assemble_story", END)
    builder.add_edge("generate_cover", END)

    return builder


# ── Public alias so pipeline_runner can build its own checkpointed copy ─────
build_graph = _build_graph

# ── Compiled graph — used by `langgraph dev` / LangGraph API platform ────────
# NO checkpointer here: the platform injects its own persistence layer
# automatically.  Adding one causes a ValueError on startup.
# The standalone FastAPI runner (pipeline_runner.py) compiles its own copy
# with InMemorySaver so that interrupt/resume works outside the platform.
compiled_graph = _build_graph().compile()