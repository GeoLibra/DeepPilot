"""Web research node backed by Gemini grounded search."""

import logging
import os
import time

from dotenv import load_dotenv
from google.genai import Client
from langchain_core.runnables import RunnableConfig
from langgraph.types import Send

from agent.citation_audit import audit_source_citations
from agent.configuration import Configuration
from agent.prompts import get_current_date, web_searcher_instructions
from agent.state import OverallState, QueryGenerationState, WebSearchState
from agent.utils import (
    format_web_research_failure,
    get_citations,
    insert_citation_markers,
    resolve_urls,
)

load_dotenv()

logger = logging.getLogger(__name__)
WEB_RESEARCH_MAX_ATTEMPTS = 3
WEB_RESEARCH_RETRY_BASE_SECONDS = 1.0

web_research_api_key = os.getenv("WEB_RESEARCH_API_KEY") or os.getenv("GEMINI_API_KEY")
if web_research_api_key is None:
    raise ValueError("WEB_RESEARCH_API_KEY is not set")

genai_client = Client(api_key=web_research_api_key)


def _web_research_failure_result(state: WebSearchState, exc: Exception) -> OverallState:
    query = state["search_query"]
    error_type = exc.__class__.__name__
    error_message = str(exc).strip() or "provider request failed"
    summary = format_web_research_failure(query, error_type, error_message)

    return {
        "sources_gathered": [],
        "search_query": [query],
        "web_research_result": [summary],
    }


def continue_to_web_research(state: QueryGenerationState):
    """LangGraph node that sends the search queries to the web research node.

    This is used to spawn n number of web research nodes, one for each search query.
    """
    return [
        Send("web_research", {"search_query": search_query, "id": int(idx)})
        for idx, search_query in enumerate(state["search_query"])
    ]


def _generate_grounded_content(
    model: str,
    formatted_prompt: str,
):
    """Call Gemini grounded search with short retries for transient transport failures."""
    last_error: Exception | None = None
    for attempt in range(1, WEB_RESEARCH_MAX_ATTEMPTS + 1):
        try:
            return genai_client.models.generate_content(
                model=model,
                contents=formatted_prompt,
                config={
                    "tools": [{"google_search": {}}],
                    "temperature": 0,
                },
            )
        except Exception as exc:
            last_error = exc
            if attempt >= WEB_RESEARCH_MAX_ATTEMPTS:
                break

            sleep_seconds = WEB_RESEARCH_RETRY_BASE_SECONDS * (2 ** (attempt - 1))
            logger.warning(
                "Web research provider request failed for attempt %s/%s; "
                "retrying in %.1fs: %s: %s",
                attempt,
                WEB_RESEARCH_MAX_ATTEMPTS,
                sleep_seconds,
                exc.__class__.__name__,
                str(exc),
            )
            time.sleep(sleep_seconds)

    if last_error is None:
        raise RuntimeError("web research provider returned no response")
    raise last_error


def web_research(state: WebSearchState, config: RunnableConfig) -> OverallState:
    """LangGraph node that performs web research using the grounded search adapter.

    Executes a web search and returns a sourced summary with grounding metadata.

    Args:
        state: Current graph state containing the search query and research loop count
        config: Configuration for the runnable, including search API settings

    Returns:
        Dictionary with state update, including sources_gathered, research_loop_count, and web_research_results
    """
    # Configure
    configurable = Configuration.from_runnable_config(config)
    formatted_prompt = web_searcher_instructions.format(
        current_date=get_current_date(),
        research_topic=state["search_query"],
    )

    # Use the direct provider client because the LangChain wrapper does not expose grounding metadata.
    try:
        response = _generate_grounded_content(
            configurable.web_search_model,
            formatted_prompt,
        )
    except Exception as exc:
        logger.warning(
            "Web research provider request failed after %s attempts for query %r: %s: %s",
            WEB_RESEARCH_MAX_ATTEMPTS,
            state["search_query"],
            exc.__class__.__name__,
            str(exc),
        )
        logger.debug("Web research provider traceback", exc_info=True)
        return _web_research_failure_result(state, exc)
    candidate = response.candidates[0] if getattr(response, "candidates", None) else None
    grounding_metadata = getattr(candidate, "grounding_metadata", None)
    grounding_chunks = getattr(grounding_metadata, "grounding_chunks", None)

    # Resolve the URLs to short URLs for saving tokens and time. Gemini may
    # return text without grounding chunks, so this path must be citation-free.
    resolved_urls = resolve_urls(grounding_chunks, state["id"])
    # Gets the citations and adds them to the generated text
    citations = get_citations(response, resolved_urls)
    source_audit = audit_source_citations(citations)
    filtered_citations = source_audit["citations"]
    modified_text = insert_citation_markers(response.text or "", filtered_citations)
    sources_gathered = [item for citation in filtered_citations for item in citation["segments"]]

    return {
        "sources_gathered": sources_gathered,
        "source_audit": [source_audit["audit"]],
        "search_query": [state["search_query"]],
        "web_research_result": [modified_text],
    }
