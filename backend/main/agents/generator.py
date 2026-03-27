"""
agents/generator.py — Story content generation agent.

Handles chapter-level parallel generation of story text using Gemini.
"""

import json
import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from tenacity import retry, stop_after_attempt, wait_exponential

from config import settings
from state.schema import ChapterWorkerState

logger = logging.getLogger(__name__)

_llm = ChatGoogleGenerativeAI(
    model=settings.gemini_model,
    google_api_key=settings.gemini_api_key,
    temperature=0.8,
    max_output_tokens=4096,  # Increased for multi-section chapters
)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True
)
def _invoke_generator(messages):
    """Internal helper to invoke LLM with retries."""
    return _llm.invoke(messages)


def generate_chapter(state: ChapterWorkerState) -> dict:
    """
    Worker node that generates text for all sections in a given chapter.
    Injects global indices to ensure predictable script assembly.
    """
    chapter = state["chapter"]
    sections = chapter["sections"]
    target = state["target_words"]
    story_id = state["story_id"]

    logger.info(
        "generator.chapter_start story_id=%s ch=%d/%r n_sections=%d target_words=%d",
        story_id,
        chapter["chapter_index"],
        chapter["title"],
        len(sections),
        target,
    )

    # Build a section list for the prompt
    section_briefs = "\n".join(
        f'{i+1}. "{s["title"]}": {s["description"]}'
        for i, s in enumerate(sections)
    )

    system_prompt = f"""You are a professional storyteller writing a chapter of a long spoken-word narrative.
Chapter: "{chapter['title']}" — {chapter['description']}
Tone: {state['tone']} | Audience: {state['audience']}

You must write {len(sections)} sections in order.
Each section: ~{target} words, 3-5 paragraphs, no title heading, no labels.
Each paragraph must be at least 50 words.
End each section with a sentence that bridges naturally to the next part of the story.

Respond ONLY with a JSON array (no preamble, no markdown fences):
[
  {{"index": {sections[0]['index']}, "content": "prose content for section 1..."}},
  ...
]
The index values MUST match these: {[s['index'] for s in sections]}"""

    human_prompt = f"Sections to write:\n{section_briefs}\n\nWrite all {len(sections)} sections now as a JSON array:"

    response = _invoke_generator(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ]
    )

    raw = response.content
    # Normalise response to plain string (Gemini sometimes returns multi-part lists)
    if isinstance(raw, list):
        raw = " ".join(
            p["text"] if isinstance(p, dict) and "text" in p else str(p) for p in raw
        )

    # Clean up markdown code blocks if they exist
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()

    try:
        results = json.loads(raw)
        if not isinstance(results, list):
            raise ValueError(f"Expected list, got {type(results).__name__}")

        # Inject chapter_index and ensure structure
        structured_results = []
        for i, item in enumerate(results):
            if isinstance(item, str):
                # Fallback if LLM just gave strings
                structured_results.append({
                    "index": sections[i]["index"] if i < len(sections) else i,
                    "content": item,
                    "chapter_index": chapter["chapter_index"]
                })
            elif isinstance(item, dict):
                item["chapter_index"] = chapter["chapter_index"]
                structured_results.append(item)
            else:
                logger.warning("generator.skipping_invalid_item story_id=%s item_type=%s", story_id, type(item).__name__)

        logger.info(
            "generator.chapter_done story_id=%s ch=%d words=%d",
            story_id,
            chapter["chapter_index"],
            sum(len(str(r.get("content", "")).split()) for r in structured_results),
        )
        return {"sections_done": structured_results}
        
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(
            "generator.parse_error story_id=%s ch=%d error=%s raw=%s",
            story_id,
            chapter["chapter_index"],
            str(e),
            raw[:200]
        )
        # Re-raise to trigger graph retry logic
        raise