"""
parser.py — Script parsing utilities for studio narratives.
"""
import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class NarrationSegment:
    """Represents a single segment of the narration script."""

    index: int
    text: str
    is_header: bool = False



def parse_text(content: str) -> List[NarrationSegment]:
    """
    Parse plain text story into segments based on double newlines.
    
    Each segment corresponds to a paragraph or distinct thought for the narrator.
    """
    # Split by double newlines or more
    paragraphs = re.split(r"\n\s*\n", content.strip())
    
    segments = []
    for i, p in enumerate(paragraphs, 1):
        text = p.strip().replace("\n", " ")
        if not text:
            continue
            
        # Detect headers like "— The Vanishing Point —"
        is_header = text.startswith("—") and text.endswith("—")
        
        segments.append(
            NarrationSegment(
                index=i,
                text=text,
                is_header=is_header,
            )
        )
    return segments


def to_narration_instruction(segments: List[NarrationSegment]) -> str:
    """Convert segments into numbered narration script for agent instruction."""
    lines = ["[STORY SCRIPT — narrate each line in order]\n"]
    for s in segments:
        label = " [HEADER]" if s.is_header else ""
        lines.append(f"({s.index}){label} {s.text}")
    return "\n".join(lines)


def to_segment_data(segments: List[NarrationSegment]) -> list:
    """Convert segments to JSON format for client-side synchronization."""
    return [
        {
            "index": s.index,
            "text": s.text,
            "isHeader": s.is_header,
        }
        for s in segments
    ]
