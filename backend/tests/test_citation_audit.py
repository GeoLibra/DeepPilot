from agent.citation_audit import (
    audit_citations,
    audit_source_citations,
    classify_status_code,
    extract_citation_mentions,
)


def test_extract_citation_mentions_ignores_image_urls():
    """Extract text citations and bare URLs without auditing image Markdown."""
    answer = (
        "A claim [source](https://example.com/report). "
        "A bare URL https://example.org/path). "
        "Ignore image ![chart](https://images.example/chart.png)"
    )

    mentions = extract_citation_mentions(answer)

    assert [(mention.kind, mention.title, mention.url) for mention in mentions] == [
        ("markdown", "source", "https://example.com/report"),
        ("bare_url", None, "https://example.org/path"),
    ]


def test_classify_status_code_for_common_citation_outcomes():
    """Classify URL availability outcomes without network calls."""
    assert classify_status_code(200) == "reachable"
    assert classify_status_code(302) == "reachable"
    assert classify_status_code(403) == "blocked"
    assert classify_status_code(404) == "not_found"
    assert classify_status_code(429) == "rate_limited"
    assert classify_status_code(503) == "server_error"


def test_audit_citations_flags_unusable_links_and_blocked_review():
    """Report revision and review reasons from deterministic URL checks."""
    statuses = {
        "https://ok.example/report": "reachable",
        "https://missing.example/report": "not_found",
        "https://blocked.example/report": "blocked",
    }

    def fake_check_url(url, timeout_seconds=6.0):
        return {
            "url": url,
            "status": statuses[url],
            "status_code": 200 if statuses[url] == "reachable" else 404 if statuses[url] == "not_found" else 403,
            "final_url": url,
            "error": None,
        }

    audit = audit_citations(
        "Supported [ok](https://ok.example/report). Missing [bad](https://missing.example/report).",
        [{"value": "https://blocked.example/report"}],
        check_url=fake_check_url,
    )

    assert audit["summary"]["requires_revision"] is True
    assert audit["summary"]["requires_review"] is True
    assert audit["summary"]["status_counts"] == {
        "reachable": 1,
        "not_found": 1,
        "blocked": 1,
    }


def test_audit_citations_requires_links_for_final_answer():
    """Require citations by default for researched final answers."""
    audit = audit_citations("This answer has no sources.", check_url=lambda url, timeout_seconds=6.0: {})

    assert audit["summary"]["requires_revision"] is True
    assert audit["summary"]["revision_reasons"] == [
        "Final answer is expected to contain citations, but no Markdown links or bare URLs were found."
    ]
    assert audit["url_checks"] == []


def test_audit_source_citations_filters_unusable_sources_before_summary():
    """Remove dead source segments before they can be cited downstream."""
    citations = [
        {
            "start_index": 0,
            "end_index": 20,
            "segments": [
                {
                    "label": "Working",
                    "short_url": "https://vertexaisearch.cloud.google.com/id/0-0",
                    "value": "https://ok.example/report",
                },
                {
                    "label": "Missing",
                    "short_url": "https://vertexaisearch.cloud.google.com/id/0-1",
                    "value": "https://missing.example/report",
                },
                {
                    "label": "Blocked",
                    "short_url": "https://vertexaisearch.cloud.google.com/id/0-2",
                    "value": "https://blocked.example/report",
                },
            ],
        }
    ]
    statuses = {
        "https://ok.example/report": "reachable",
        "https://missing.example/report": "not_found",
        "https://blocked.example/report": "blocked",
    }

    def fake_check_url(url, timeout_seconds=6.0):
        return {
            "url": url,
            "status": statuses[url],
            "status_code": 200 if statuses[url] == "reachable" else 404 if statuses[url] == "not_found" else 403,
            "final_url": url,
            "error": None,
        }

    result = audit_source_citations(citations, check_url=fake_check_url)

    assert [segment["label"] for segment in result["citations"][0]["segments"]] == [
        "Working",
        "Blocked",
    ]
    assert result["audit"]["removed_segments"] == [
        {
            "label": "Missing",
            "url": "https://missing.example/report",
            "status": "not_found",
        }
    ]
    assert result["audit"]["review_urls"][0]["url"] == "https://blocked.example/report"
