"""
agents/assembler.py — Script assembly node.

Joins generated sections into a final narrative script using global indices.
"""

import logging

from state.schema import WORDS_PER_MINUTE, StoryState

logger = logging.getLogger(__name__)

# Heading format rendered between chapters.
# Intentionally plain text so TTS engines read it as a natural pause marker.
_CHAPTER_HEADING = "— {title} —"


def assemble_story(state: StoryState) -> dict:
    """
    Stitches all completed sections into a structured markdown script.
    Sorts by global index and groups by chapter for clear boundaries.

    Args:
        state: Current pipeline state (``sections_done`` and ``outline`` required).

    Returns:
        ``{"draft_script": str}``
    """
    if not state["sections_done"]:
        raise ValueError("assemble_story: called before any sections were generated.")

    outline = state["outline"]
    if not outline:
        raise ValueError("assemble_story: outline is missing from state.")

    # 1. Sort by global index to guarantee chronological order
    sorted_sections = sorted(state["sections_done"], key=lambda x: x["index"])

    # 2. Build chapter_index → title lookup from the outline
    chapter_titles: dict[int, str] = {
        ch["chapter_index"]: ch["title"]
        for ch in outline["chapters"]
    }

    # 3. Group section content by chapter
    chapters: dict[int, list[str]] = {}
    for sec in sorted_sections:
        ci = sec["chapter_index"]
        chapters.setdefault(ci, []).append(sec["content"])

    # 4. Render chapter blocks (heading + joined section prose)
    chapter_blocks: list[str] = []
    for ci in sorted(chapters.keys()):
        title   = chapter_titles.get(ci, f"Chapter {ci + 1}")
        heading = _CHAPTER_HEADING.format(title=title)
        body    = "\n\n".join(chapters[ci])
        chapter_blocks.append(f"{heading}\n\n{body}")

    # 5. Combine: hook → chapters → climax → closing
    story_body   = "\n\n\n".join(chapter_blocks)
    draft_script = (
        f"{outline['hook']}\n\n"
        f"{story_body}\n\n"
        f"{outline['climax']}\n\n"
        f"{outline['closing']}"
    ).strip()

    word_count         = len(draft_script.split())
    estimated_minutes  = round(word_count / WORDS_PER_MINUTE)

    logger.info(
        "assembler.done story_id=%s chapters=%d sections=%d "
        "words=%d estimated_mins=%d script_chars=%d",
        state["story_id"],
        len(chapters),
        len(sorted_sections),
        word_count,
        estimated_minutes,
        len(draft_script),
    )

    return {"draft_script": draft_script}