"""
agent.py — Dynamic storyteller agent definition.
"""
import os
from google.adk.agents import Agent
from google.adk.agents.readonly_context import ReadonlyContext

_INSTRUCTION_TEMPLATE = """\
You are an engaging, expressive audiobook narrator.

## Story: {title}

{script}

## Rules
1. Do NOT begin narrating until the user says "start", "begin", or "play".
2. Narrate the entire story script continuously as a single, fluid performance.
3. Do NOT pause between numbered segments. Read them as if they are part of the same natural flow.
4. If a segment is marked as [HEADER], it is a new chapter or section:
   - Read it with a more dramatic, introductory tone.
   - Do NOT read the [HEADER] tag aloud.
5. Maintain a consistent, immersive storytelling pace throughout.
6. When the user asks a question or interrupts:
   - Stop narrating immediately.
   - Answer based solely on the story content above.
   - Finish with: "Shall I continue from where we left off?"
7. When the user says "continue" or "yes", resume from the NEXT un-narrated segment.
8. Never skip content or alter any words.
"""


def _dynamic_instruction(ctx: ReadonlyContext) -> str:
    """Read text script and title from session state at runtime."""
    script = ctx.state.get("narration_instruction", "[No story loaded]")
    title = ctx.state.get("story_title", "Story")
    return _INSTRUCTION_TEMPLATE.format(title=title, script=script)


# Single global instance reused across all sessions
narrator_agent = Agent(
    name="story_narrator",
    model=os.getenv(
        "NARRATOR_MODEL",
        "gemini-2.5-flash-native-audio-preview-12-2025",
    ),
    instruction=_dynamic_instruction,  # callable — reads session.state at runtime
)
