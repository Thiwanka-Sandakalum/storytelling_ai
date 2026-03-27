"""
agents/planner.py — Story planning agent.

Generates a chapter-structured outline with section briefs based on 
topic and requested length.
"""

import logging

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from tenacity import retry, stop_after_attempt, wait_exponential

from config import settings
from state.schema import (
    LENGTH_CONFIG,
    ChapterPlan,
    PlannerOutput,
    StoryChapter,
    StoryOutline,
    StorySection,
    StoryState,
)

logger = logging.getLogger(__name__)

# Higher token ceiling because long outlines contain 48 section briefs.
_llm = ChatGoogleGenerativeAI(
    model=settings.gemini_model,
    google_api_key=settings.gemini_api_key,
    temperature=0.7,
    max_output_tokens=4096,
)

# Bind to PlannerOutput — not StoryOutline — so the LLM sees a clean schema
# without runtime fields (indices, target_words, flat sections list, etc.).
_structured_llm = _llm.with_structured_output(PlannerOutput)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True
)
def _invoke_planner(messages):
    """Internal helper to invoke LLM with retries."""
    return _structured_llm.invoke(messages)


def plan_story(state: StoryState) -> dict:
    """
    Orchestrates the story structure: flattening the LLM's chapter-tree 
    into a globally-indexed section list for parallel generation.
    """
    if state.get("outline"):
        logger.info("planner.skip story_id=%s outline already exists", state["story_id"])
        return {}
    cfg             = LENGTH_CONFIG[state["length"]]
    n_chapters      = cfg["chapters"]
    sections_per    = cfg["sections_per"]
    words_per       = cfg["words_per"]
    target_minutes  = cfg["target_mins"]
    total_sections  = n_chapters * sections_per
    target_words    = total_sections * words_per

    logger.info(
        "planner.start story_id=%s topic=%r length=%s "
        "chapters=%d sections=%d target_words=%d target_mins=%d",
        state["story_id"], state["topic"], state["length"],
        n_chapters, total_sections, target_words, target_minutes,
    )

    system_prompt = f"""You are a master storyteller and content strategist.
Your task: produce a detailed story outline for a spoken-word narration of approximately {target_minutes} minutes.

Style:
  - Tone: {state['tone']}
  - Audience: {state['audience']}
  - Total target words: ~{target_words:,}

Required structure:
  hook    → One powerful opening sentence that immediately arrests attention.
  chapters → Exactly {n_chapters} chapters. Each chapter:
               • title       — short, evocative act/chapter title (e.g. "The Breaking Point")
               • description — 1–2 sentences on this chapter's narrative role and emotional arc
               • sections    — Exactly {sections_per} sections per chapter. Each section:
                                  – title       — concise descriptive label
                                  – description — 1–2 sentences on what this section covers
  climax  → The single sentence that names the emotional peak or key insight.
  closing → One memorable sentence: a call-to-action or resonant final thought.

Total sections required: {total_sections} ({n_chapters} chapters × {sections_per} sections).
Write descriptions for the ear, not the eye. Think in narrative arcs, tension, and release."""

    human_prompt = f"Create the full story outline for: {state['topic']}"

    raw: PlannerOutput = _invoke_planner([
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt),
    ])


    # Assign global indices while building the chapter tree, then produce a
    # flat section list for O(1) worker dispatch.

    chapters: list[StoryChapter] = []
    flat_sections: list[StorySection] = []
    global_index: int = 0

    for ch_i, ch_plan in enumerate(raw["chapters"]):
        chapter_sections: list[StorySection] = []

        for sec_plan in ch_plan["sections"]:
            section: StorySection = {
                "title":         sec_plan["title"],
                "description":   sec_plan["description"],
                "index":         global_index,
                "chapter_index": ch_i,
                "chapter_title": ch_plan["title"],
                "content":       None,
            }
            chapter_sections.append(section)
            flat_sections.append(section)
            global_index += 1

        chapters.append({
            "title":         ch_plan["title"],
            "description":   ch_plan["description"],
            "chapter_index": ch_i,
            "sections":      chapter_sections,
        })

    outline: StoryOutline = {
        "hook":           raw["hook"],
        "chapters":       chapters,
        "sections":       flat_sections,
        "climax":         raw["climax"],
        "closing":        raw["closing"],
        "target_words":   target_words,
        "target_minutes": target_minutes,
    }

    # Warn if Gemini returned fewer sections than requested (structured output
    # compliance varies; the generator will still handle whatever it receives).
    if len(flat_sections) != total_sections:
        logger.warning(
            "planner.section_count_mismatch story_id=%s expected=%d got=%d",
            state["story_id"], total_sections, len(flat_sections),
        )

    logger.info(
        "planner.done story_id=%s chapters=%d sections=%d",
        state["story_id"], len(chapters), len(flat_sections),
    )
    return {"outline": outline}