"""
agents/generator.py — Story content generation agent.

Handles chapter-level parallel generation of story text using Gemini.
"""

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.config import get_stream_writer
from typing_extensions import TypedDict

from config import settings
from state.schema import ChapterWorkerState

logger = logging.getLogger(__name__)

_structured_llm = None


class GeneratedSection(TypedDict):
    """Schema for one generated section from the chapter worker."""

    index: int
    content: str


class GeneratedChapterOutput(TypedDict):
    """Structured output returned by the chapter generator model call."""

    sections: list[GeneratedSection]


def _get_structured_llm():
    """Lazily build the generator LLM so startup does not hard-fail on env issues."""
    global _structured_llm
    if _structured_llm is None:
        llm_kwargs: dict = {
            "model": settings.gemini_model,
            "temperature": 0.8,
            "max_output_tokens": 4096,
        }

        if settings.using_vertex_ai:
            if not settings.vertex_project_id.strip():
                raise ValueError(
                    "VERTEX_PROJECT_ID is required when USE_VERTEX_AI=true."
                )
            llm_kwargs.update(
                {
                    "vertexai": True,
                    "project": settings.vertex_project_id,
                    "location": settings.vertex_location,
                }
            )
        else:
            llm_kwargs["google_api_key"] = settings.gemini_api_key

        llm = ChatGoogleGenerativeAI(**llm_kwargs)
        _structured_llm = llm.with_structured_output(GeneratedChapterOutput)
    return _structured_llm


async def generate_chapter(state: ChapterWorkerState) -> dict:
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

    writer = get_stream_writer()
    writer({
        "node": "generate_chapter",
        "status": "generating",
        "message": f"Writing chapter {chapter['chapter_index'] + 1}: {chapter['title']}…",
        "chapter_index": chapter["chapter_index"],
    })

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

Return output in the schema:
{{"sections": [{{"index": <global index>, "content": <generated prose>}}, ...]}}

The index values MUST match these: {[s['index'] for s in sections]}"""

    human_prompt = f"Sections to write:\n{section_briefs}\n\nWrite all {len(sections)} sections now using the required schema."

    response: GeneratedChapterOutput = await _get_structured_llm().ainvoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ]
    )

    # Inject chapter index for assembler grouping while preserving model-provided order.
    structured_results: list[dict] = []
    for i, item in enumerate(response["sections"]):
        section_index = item.get("index", sections[i]["index"] if i < len(sections) else i)
        structured_results.append(
            {
                "index": section_index,
                "content": item.get("content", ""),
                "chapter_index": chapter["chapter_index"],
            }
        )

    logger.info(
        "generator.chapter_done story_id=%s ch=%d words=%d",
        story_id,
        chapter["chapter_index"],
        sum(len(str(r.get("content", "")).split()) for r in structured_results),
    )

    # Guard: the operator.add reducer expects a list. A non-list would silently
    # corrupt state (e.g. None + list raises TypeError in the reducer).
    if not isinstance(structured_results, list):
        raise TypeError(
            f"generate_chapter: sections_done must be a list, got "
            f"{type(structured_results).__name__} for story_id={story_id} "
            f"chapter={chapter['chapter_index']}"
        )

    return {"sections_done": structured_results}