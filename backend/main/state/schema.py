"""
state/schema.py — Shared state types for the LangGraph story pipeline.

Key design decisions:
- LENGTH_CONFIG is the single source of truth for story sizing.
- PlannerOutput is the LLM-facing schema (what Gemini must return).
- StoryOutline is the runtime schema (richer, with flat section list + metadata).
- StorySection carries chapter_index + chapter_title so every generator worker
  has narrative context without needing to look anything up.
"""

import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict


# ── Runtime constants ─────────────────────────────────────────────────────────

#: Industry-standard spoken narration pace (words per minute).
WORDS_PER_MINUTE: int = 130

#: Drives the planner, generator, and pipeline for each story length.
#:
#: chapters       → number of narrative acts / chapters
#: sections_per   → sections inside each chapter (all chapters same size)
#: words_per      → target word count per generated section
#: target_mins    → approximate playback duration in minutes
#:
#: Resulting totals:
#:   short  →  2 × 4  =  8 sections ×  175 w ≈  1 400 w ≈ 10 min
#:   medium →  4 × 6  = 24 sections ×  250 w ≈  6 000 w ≈ 46 min
#:   long   →  6 × 8  = 48 sections ×  300 w ≈ 14 400 w ≈ 90 min
LENGTH_CONFIG: dict[str, dict] = {
    "short":  {"chapters": 2, "sections_per": 4,  "words_per": 175, "target_mins": 10},
    "medium": {"chapters": 4, "sections_per": 6,  "words_per": 250, "target_mins": 45},
    "long":   {"chapters": 6, "sections_per": 8,  "words_per": 300, "target_mins": 90},
}


# ── Runtime schema ────────────────────────────────────────────────────────────

class StorySection(TypedDict):
    """A single narrative section — the atomic unit of generation."""

    title: str
    description: str
    index: int            # Global 0-based position across all chapters
    chapter_index: int    # Which chapter/act this section belongs to
    chapter_title: str    # Parent chapter title passed to the generator for context
    content: str | None   # Filled in by the generate_section worker


class StoryChapter(TypedDict):
    """A narrative chapter / act that groups multiple sections."""

    title: str
    description: str
    chapter_index: int
    sections: list[StorySection]


class StoryOutline(TypedDict):
    """
    Complete story plan produced by plan_story and consumed by downstream nodes.

    ``sections`` is a *flat* list derived from the chapter tree so that
    assign_workers can dispatch workers without traversing nested structures.
    """

    hook: str
    chapters: list[StoryChapter]
    sections: list[StorySection]   # Flat; built by the planner from chapters
    climax: str
    closing: str
    target_words: int              # Total target word count for the full script
    target_minutes: int            # Expected playback duration


# ── LLM structured-output targets ────────────────────────────────────────────
# These types define exactly what Gemini must return.
# Keeping them separate from the runtime schema means the planner can do
# post-processing (index assignment, flattening) without polluting the LLM prompt.

class SectionPlan(TypedDict):
    """Minimal section descriptor the LLM must supply."""
    title: str
    description: str


class ChapterPlan(TypedDict):
    """Chapter descriptor with its section list from the LLM."""
    title: str
    description: str
    sections: list[SectionPlan]


class PlannerOutput(TypedDict):
    """The exact top-level shape Gemini returns for story planning."""
    hook: str
    chapters: list[ChapterPlan]
    climax: str
    closing: str


# ── Graph states ──────────────────────────────────────────────────────────────

class StoryState(TypedDict):
    """
    Shared state object that flows through every node in the LangGraph pipeline.

    Inputs are set once at graph invocation and never mutated.
    Pipeline outputs are filled progressively as each agent node completes.
    """

    # ── Required inputs ────────────────────────────────────────────────────
    story_id: str
    topic: str
    tone: Literal["inspirational", "dark", "educational", "funny"]
    audience: str
    length: Literal["short", "medium", "long"]
    user_prefs: dict                  # Reserved for per-user style overrides

    # ── Pipeline outputs ───────────────────────────────────────────────────
    outline: StoryOutline | None       # Planner

    # operator.add reducer: parallel workers safely append without overwriting.
    # Each element: {"index": int, "chapter_index": int, "content": str}
    sections_done: Annotated[list[dict], operator.add]

    draft_script: str | None           # Assembler
    script_path: str | None            # Saver (S3/MinIO key)

    # ── Control flow ───────────────────────────────────────────────────────
    retry_count: int
    error: str | None


class WorkerState(TypedDict):
    """
    Per-section state passed to each parallel generate_section worker.

    ``target_words`` is injected by assign_workers from LENGTH_CONFIG so the
    generator can produce appropriately sized prose for the requested duration.
    """

    section: StorySection
    story_id: str
    tone: str
    audience: str
    target_words: int                  # Words to generate for this section
    sections_done: Annotated[list[dict], operator.add]


class ChapterWorkerState(TypedDict):
    """
    Per-chapter state passed to each parallel generate_chapter worker.
    Reduces the number of LLM calls by grouping all sections in a chapter.
    """
    chapter: StoryChapter
    story_id: str
    tone: str
    audience: str
    target_words: int                  # per section, injected from length cfg
    sections_done: Annotated[list[dict], operator.add]