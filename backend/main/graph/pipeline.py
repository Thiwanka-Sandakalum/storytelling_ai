"""
graph/pipeline.py — Story generation pipeline definition.

Orchestrates the flow from planning to chapter generation to script assembly.
"""

import logging

from langgraph.graph import StateGraph, START, END
from langgraph.types import Send

from agents.assembler import assemble_story
from agents.generator import generate_chapter
from agents.planner import plan_story
from state.schema import LENGTH_CONFIG, StoryState

logger = logging.getLogger(__name__)


# ── Conditional edge: fan-out one worker per chapter ─────────────────────────

def assign_workers(state: StoryState) -> list[Send]:
    """
    Reads the planner's chapter tree and dispatches one parallel
    ``generate_chapter`` worker per chapter using LangGraph's Send API.
    """
    # ── Interactivity Check ──
    # If the user wants to review the outline, and we haven't been 'approved' yet,
    # we return an empty list to stop the fan-out here.
    # We check 'approved' inside 'user_prefs' for flexibility.
    if state["user_prefs"].get("require_approval") and not state["user_prefs"].get("approved"):
        logger.info("pipeline.awaiting_approval story_id=%s pausing fan-out", state["story_id"])
        return []

    outline = state["outline"]
    if not outline or not outline.get("chapters"):
        logger.warning("pipeline.assign_workers: outline or chapters missing.")
        return []

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
    ]


# ── Graph construction ────────────────────────────────────────────────────────

def _build_graph() -> StateGraph:
    builder = StateGraph(StoryState)

    # ── Nodes ─────────────────────────────────────────────────────────────────
    builder.add_node("plan_story",       plan_story)        # Orchestrator
    builder.add_node("generate_chapter", generate_chapter)  # Parallel workers
    builder.add_node("assemble_story",   assemble_story)    # Chapter-aware fan-in

    # ── Edges ─────────────────────────────────────────────────────────────────
    # 1. START → Planner
    builder.add_edge(START, "plan_story")

    # 2. Planner → parallel workers (Send fan-out, one per chapter)
    builder.add_conditional_edges(
        "plan_story",
        assign_workers,
        ["generate_chapter", END],  # END is now a valid target if pausing for approval
    )

    # 3. Workers → Assembler (implicit fan-in: waits for all workers to complete)
    builder.add_edge("generate_chapter", "assemble_story")

    # 4. Assembler → END (draft_script is persisted to Postgres by Celery)
    builder.add_edge("assemble_story", END)

    return builder


# ── Compiled graph — imported by Celery tasks and `langgraph dev` ─────────────
compiled_graph = _build_graph().compile()