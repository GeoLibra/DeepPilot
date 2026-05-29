from types import SimpleNamespace

from agent.utils import get_citations, resolve_urls


def test_resolve_urls_handles_missing_grounding_chunks():
    assert resolve_urls(None, 1) == {}


def test_resolve_urls_skips_chunks_without_uri():
    chunks = [
        SimpleNamespace(web=SimpleNamespace(uri="https://example.com/a")),
        SimpleNamespace(web=SimpleNamespace(uri=None)),
        SimpleNamespace(web=None),
    ]

    assert resolve_urls(chunks, 2) == {
        "https://example.com/a": "https://vertexaisearch.cloud.google.com/id/2-0"
    }


def test_get_citations_handles_missing_grounding_chunks():
    response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                grounding_metadata=SimpleNamespace(
                    grounding_chunks=None,
                    grounding_supports=[
                        SimpleNamespace(
                            segment=SimpleNamespace(start_index=0, end_index=5),
                            grounding_chunk_indices=[0],
                        )
                    ],
                )
            )
        ]
    )

    assert get_citations(response, {}) == [
        {"start_index": 0, "end_index": 5, "segments": []}
    ]


def test_get_citations_handles_missing_grounding_supports():
    response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                grounding_metadata=SimpleNamespace(
                    grounding_chunks=[],
                    grounding_supports=None,
                )
            )
        ]
    )

    assert get_citations(response, {}) == []
