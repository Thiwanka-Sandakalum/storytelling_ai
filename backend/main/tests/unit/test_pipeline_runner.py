import pytest

from pipeline_runner import (
    _describe_updates_payload,
    _get_interrupts_from_stream_part,
    _get_update_entries_from_stream_part,
    _normalize_stream_part,
)


def test_normalize_stream_part_converts_mode_payload_tuple() -> None:
    chunk = ("updates", {"plan_story": {"outline": {}}})

    assert _normalize_stream_part(chunk) == {
        "type": "updates",
        "ns": (),
        "data": {"plan_story": {"outline": {}}},
    }


def test_normalize_stream_part_converts_namespace_mode_payload_tuple() -> None:
    chunk = (("subgraph:1",), "custom", {"message": "hello"})

    assert _normalize_stream_part(chunk) == {
        "type": "custom",
        "ns": ("subgraph:1",),
        "data": {"message": "hello"},
    }


def test_normalize_stream_part_rejects_unknown_shapes() -> None:
    with pytest.raises(TypeError, match="Unexpected LangGraph stream chunk shape"):
        _normalize_stream_part(("values", {"x": 1}, "extra", "overflow"))


def test_get_interrupts_from_stream_part_ignores_non_values_chunks() -> None:
    chunk = {
        "type": "updates",
        "ns": (),
        "data": {"plan_story": {"outline": {}}},
    }

    assert _get_interrupts_from_stream_part(chunk) == ()


def test_get_interrupts_from_stream_part_returns_interrupts_for_values_chunks() -> None:
    interrupt_obj = {"value": {"outline": {"hook": "x"}}}
    chunk = {
        "type": "values",
        "ns": (),
        "data": {"outline": {"hook": "x"}},
        "interrupts": (interrupt_obj,),
    }

    assert _get_interrupts_from_stream_part(chunk) == (interrupt_obj,)


def test_get_interrupts_from_stream_part_returns_interrupts_for_updates_compat_chunks() -> None:
    interrupt_obj = {"value": {"outline": {"hook": "x"}}}
    chunk = {
        "type": "updates",
        "ns": (),
        "data": {"__interrupt__": (interrupt_obj,)},
    }

    assert _get_interrupts_from_stream_part(chunk) == (interrupt_obj,)


def test_get_interrupts_from_stream_part_ignores_updates_without_interrupts() -> None:
    chunk = {
        "type": "updates",
        "ns": (),
        "data": {"plan_story": {"outline": {}}},
    }

    assert _get_interrupts_from_stream_part(chunk) == ()


def test_get_update_entries_from_stream_part_filters_non_dict_node_outputs() -> None:
    chunk = {
        "type": "updates",
        "ns": (),
        "data": {
            "plan_story": {"outline": {"hook": "x"}},
            "internal_router": ["generate_cover"],
        },
    }

    assert _get_update_entries_from_stream_part(chunk) == (
        ("plan_story", {"outline": {"hook": "x"}}),
    )


def test_get_update_entries_from_stream_part_rejects_non_dict_data() -> None:
    chunk = {
        "type": "updates",
        "ns": (),
        "data": ["not", "a", "mapping"],
    }

    assert _get_update_entries_from_stream_part(chunk) == ()


def test_describe_updates_payload_for_non_dict_data() -> None:
    chunk = {
        "type": "updates",
        "data": ["not", "a", "mapping"],
    }

    assert _describe_updates_payload(chunk) == "data_type=list"


def test_describe_updates_payload_for_dict_entries() -> None:
    chunk = {
        "type": "updates",
        "data": {
            "await_approval": [],
            "plan_story": {"outline": {}},
        },
    }

    summary = _describe_updates_payload(chunk)
    assert summary.startswith("data_type=dict entries=")
    assert "await_approval:list" in summary
    assert "plan_story:dict" in summary
