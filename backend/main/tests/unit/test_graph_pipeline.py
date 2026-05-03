from langgraph.graph import END

from graph.pipeline import _planner_cache_key, assign_workers


def _sample_outline() -> dict:
    return {
        "chapters": [
            {
                "title": "Chapter 1",
                "description": "desc",
                "chapter_index": 0,
                "sections": [
                    {
                        "title": "Section 1",
                        "description": "desc",
                        "index": 0,
                        "chapter_index": 0,
                        "chapter_title": "Chapter 1",
                        "content": None,
                    }
                ],
            }
        ]
    }


def test_assign_workers_allows_missing_user_prefs() -> None:
    state = {
        "story_id": "1",
        "length": "short",
        "tone": "educational",
        "audience": "general audience",
        "outline": _sample_outline(),
    }

    sends = assign_workers(state)

    assert len(sends) == 1


def test_assign_workers_ignores_extra_user_prefs_keys() -> None:
    state = {
        "story_id": "1",
        "length": "short",
        "tone": "educational",
        "audience": "general audience",
        "outline": _sample_outline(),
        "user_prefs": {"require_approval": True, "approved": False},
    }

    sends = assign_workers(state)

    assert len(sends) == 1


def test_planner_cache_key_ignores_story_id_and_runtime_only_prefs() -> None:
    left = {
        "story_id": "story-a",
        "topic": "Why stars form",
        "tone": "educational",
        "audience": "students",
        "length": "short",
        "user_prefs": {"voice": "Puck", "require_approval": True, "style": "cinematic"},
    }
    right = {
        "story_id": "story-b",
        "topic": "Why stars form",
        "tone": "educational",
        "audience": "students",
        "length": "short",
        "user_prefs": {"voice": "Charon", "require_approval": False, "style": "cinematic"},
    }

    assert _planner_cache_key(left) == _planner_cache_key(right)


def test_planner_cache_key_changes_for_semantic_input_changes() -> None:
    base = {
        "story_id": "story-a",
        "topic": "Why stars form",
        "tone": "educational",
        "audience": "students",
        "length": "short",
        "user_prefs": {"style": "cinematic"},
    }
    changed = dict(base)
    changed["topic"] = "Why black holes form"

    assert _planner_cache_key(base) != _planner_cache_key(changed)


def test_assign_workers_returns_end_when_outline_missing() -> None:
    state = {
        "story_id": "1",
        "length": "short",
        "tone": "educational",
        "audience": "general audience",
        "outline": None,
    }

    assert assign_workers(state) == END
