"""Citation extraction and URL availability audit helpers."""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MARKDOWN_LINK_PATTERN = re.compile(r"(?<!!)\[([^\]\n]{1,250})\]\((https?://[^)\s]+)\)", re.IGNORECASE)
IMAGE_LINK_PATTERN = re.compile(r"!\[[^\]\n]{0,250}\]\((https?://[^)\s]+)\)", re.IGNORECASE)
BARE_URL_PATTERN = re.compile(r"https?://[^\s<>\]\"'`]+", re.IGNORECASE)
TRAILING_URL_PUNCTUATION = ".,;:!?)]}'\""
UNUSABLE_URL_STATUSES = {"invalid_url", "not_found", "timeout", "server_error", "client_error", "request_error"}
REVIEW_URL_STATUSES = {"blocked", "rate_limited"}


@dataclass(frozen=True)
class CitationMention:
    """A citation or URL mention found in model output."""

    title: str | None
    url: str
    kind: str


def clean_url(url: str) -> str:
    """Normalize punctuation around a URL extracted from Markdown text."""
    cleaned = url.strip().strip("<>")
    while cleaned and cleaned[-1] in TRAILING_URL_PUNCTUATION:
        cleaned = cleaned[:-1]
    return cleaned


def extract_citation_mentions(text: str) -> list[CitationMention]:
    """Extract Markdown links and bare HTTP(S) URLs from final answer text."""
    text = text or ""
    mentions: list[CitationMention] = []
    covered_url_spans: list[tuple[int, int]] = []

    for match in MARKDOWN_LINK_PATTERN.finditer(text):
        title = match.group(1).strip()
        url = clean_url(match.group(2))
        kind = "citation" if title.lower().startswith("citation:") else "markdown"
        mentions.append(CitationMention(title=title, url=url, kind=kind))
        covered_url_spans.append((match.start(2), match.end(2)))

    for match in IMAGE_LINK_PATTERN.finditer(text):
        covered_url_spans.append((match.start(1), match.end(1)))

    for match in BARE_URL_PATTERN.finditer(text):
        if any(start <= match.start() < end for start, end in covered_url_spans):
            continue
        mentions.append(CitationMention(title=None, url=clean_url(match.group(0)), kind="bare_url"))

    return mentions


def unique_urls(mentions: list[CitationMention], sources_gathered: list[dict[str, Any]] | None = None) -> list[str]:
    """Return unique URLs from answer mentions plus gathered source metadata."""
    seen = set()
    urls = [mention.url for mention in mentions]
    for source in sources_gathered or []:
        value = source.get("value")
        if isinstance(value, str) and value.strip():
            urls.append(clean_url(value))

    ordered_urls = []
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        ordered_urls.append(url)
    return ordered_urls


def _is_http_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def classify_status_code(status_code: int) -> str:
    """Classify an HTTP status code for citation-audit purposes."""
    if 200 <= status_code < 400:
        return "reachable"
    if status_code in {401, 403}:
        return "blocked"
    if status_code == 429:
        return "rate_limited"
    if status_code in {404, 410}:
        return "not_found"
    if 400 <= status_code < 500:
        return "client_error"
    if 500 <= status_code < 600:
        return "server_error"
    return "request_error"


def check_url_availability(url: str, timeout_seconds: float = 6.0) -> dict[str, Any]:
    """Check whether a citation URL is available using stdlib HTTP clients."""
    if not _is_http_url(url):
        return {
            "url": url,
            "status": "invalid_url",
            "status_code": None,
            "final_url": None,
            "error": "URL must use http or https and include a host.",
        }

    request = Request(
        url,
        method="GET",
        headers={
            "User-Agent": "DeepPilot-CitationAudit/1.0",
            "Range": "bytes=0-2047",
        },
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            status_code = response.getcode()
            return {
                "url": url,
                "status": classify_status_code(status_code),
                "status_code": status_code,
                "final_url": response.geturl(),
                "error": None,
            }
    except HTTPError as err:
        return {
            "url": url,
            "status": classify_status_code(err.code),
            "status_code": err.code,
            "final_url": err.geturl(),
            "error": str(err),
        }
    except TimeoutError:
        return {"url": url, "status": "timeout", "status_code": None, "final_url": None, "error": "Request timed out."}
    except URLError as err:
        return {
            "url": url,
            "status": "request_error",
            "status_code": None,
            "final_url": None,
            "error": str(err.reason),
        }


def audit_citations(
    answer: str,
    sources_gathered: list[dict[str, Any]] | None = None,
    *,
    require_citations: bool = True,
    max_urls: int = 30,
    timeout_seconds: float = 6.0,
    check_url=check_url_availability,
) -> dict[str, Any]:
    """Audit final-answer citations and gathered source URLs."""
    mentions = extract_citation_mentions(answer)
    urls = unique_urls(mentions, sources_gathered)
    urls_to_check = urls[:max_urls]
    url_checks = [check_url(url, timeout_seconds=timeout_seconds) for url in urls_to_check]
    status_counts = Counter(check["status"] for check in url_checks)

    cited_urls = {mention.url for mention in mentions}
    gathered_urls = {clean_url(source.get("value", "")) for source in sources_gathered or [] if isinstance(source.get("value"), str)}
    unused_gathered_urls = sorted(gathered_urls - cited_urls)

    revision_reasons = []
    review_reasons = []
    if require_citations and not mentions:
        revision_reasons.append("Final answer is expected to contain citations, but no Markdown links or bare URLs were found.")

    unusable_checks = [check for check in url_checks if check["status"] in UNUSABLE_URL_STATUSES]
    review_checks = [check for check in url_checks if check["status"] in REVIEW_URL_STATUSES]
    if unusable_checks:
        revision_reasons.append("One or more citation URLs are unusable and should be replaced, removed, or marked unverified.")
    if review_checks:
        review_reasons.append("One or more citation URLs are blocked or rate-limited and need review before being trusted.")
    if len(urls) > max_urls:
        review_reasons.append(f"{len(urls) - max_urls} URL(s) were not checked because max_urls={max_urls}.")

    return {
        "summary": {
            "citation_mention_count": len(mentions),
            "unique_url_count": len(urls),
            "checked_url_count": len(url_checks),
            "status_counts": dict(status_counts),
            "requires_revision": bool(revision_reasons),
            "requires_review": bool(review_reasons),
            "revision_reasons": revision_reasons,
            "review_reasons": review_reasons,
        },
        "citation_mentions": [mention.__dict__ for mention in mentions],
        "url_checks": url_checks,
        "unused_gathered_urls": unused_gathered_urls,
        "model_review_instructions": [
            "A reachable URL is necessary but not sufficient; keep a citation only when the source supports the surrounding claim.",
            "Remove or clearly mark claims whose URLs are unavailable, blocked, or unrelated to the evidence.",
            "Do not invent replacement URLs. Use only URLs that were gathered during research or explicitly verified.",
        ],
    }


def audit_source_citations(
    citations: list[dict[str, Any]],
    *,
    max_urls: int = 30,
    timeout_seconds: float = 6.0,
    check_url=check_url_availability,
) -> dict[str, Any]:
    """Filter unusable citation segments before they enter the research summary."""
    urls = []
    for citation in citations:
        for segment in citation.get("segments", []):
            value = segment.get("value")
            if isinstance(value, str) and value.strip():
                urls.append(clean_url(value))

    seen = set()
    unique_source_urls = []
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        unique_source_urls.append(url)

    urls_to_check = unique_source_urls[:max_urls]
    url_checks = [check_url(url, timeout_seconds=timeout_seconds) for url in urls_to_check]
    checked_by_url = {check["url"]: check for check in url_checks}
    unusable_urls = {check["url"] for check in url_checks if check["status"] in UNUSABLE_URL_STATUSES}

    filtered_citations = []
    removed_segments = []
    for citation in citations:
        kept_segments = []
        for segment in citation.get("segments", []):
            value = segment.get("value")
            source_url = clean_url(value) if isinstance(value, str) else ""
            if source_url in unusable_urls:
                removed_segments.append(
                    {
                        "label": segment.get("label"),
                        "url": source_url,
                        "status": checked_by_url[source_url]["status"],
                    }
                )
                continue
            kept_segments.append(segment)

        filtered_citation = dict(citation)
        filtered_citation["segments"] = kept_segments
        filtered_citations.append(filtered_citation)

    status_counts = Counter(check["status"] for check in url_checks)
    review_checks = [check for check in url_checks if check["status"] in REVIEW_URL_STATUSES]

    return {
        "citations": filtered_citations,
        "audit": {
            "checked_url_count": len(url_checks),
            "truncated_url_count": max(0, len(unique_source_urls) - len(urls_to_check)),
            "status_counts": dict(status_counts),
            "removed_segments": removed_segments,
            "review_urls": review_checks,
        },
    }
