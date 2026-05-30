import os

from dotenv import load_dotenv
from google.genai import Client
from langchain_core.runnables import RunnableConfig
from langgraph.types import Send

from agent.configuration import Configuration
from agent.prompts import get_current_date, web_searcher_instructions
from agent.state import OverallState, QueryGenerationState, WebSearchState
from agent.utils import get_citations, insert_citation_markers, resolve_urls

load_dotenv()

web_research_api_key = os.getenv("WEB_RESEARCH_API_KEY") or os.getenv("GEMINI_API_KEY")
if web_research_api_key is None:
    raise ValueError("WEB_RESEARCH_API_KEY is not set")

genai_client = Client(api_key=web_research_api_key)


def continue_to_web_research(state: QueryGenerationState):
    """LangGraph node that sends the search queries to the web research node.

    This is used to spawn n number of web research nodes, one for each search query.
    """
    return [
        Send("web_research", {"search_query": search_query, "id": int(idx)})
        for idx, search_query in enumerate(state["search_query"])
    ]


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
    response = genai_client.models.generate_content(
        model=configurable.web_search_model,
        contents=formatted_prompt,
        config={
            "tools": [{"google_search": {}}],
            "temperature": 0,
        },
    )
    candidate = response.candidates[0] if getattr(response, "candidates", None) else None
    grounding_metadata = getattr(candidate, "grounding_metadata", None)
    grounding_chunks = getattr(grounding_metadata, "grounding_chunks", None)

    # Resolve the URLs to short URLs for saving tokens and time. Gemini may
    # return text without grounding chunks, so this path must be citation-free.
    resolved_urls = resolve_urls(grounding_chunks, state["id"])
    # Gets the citations and adds them to the generated text
    citations = get_citations(response, resolved_urls)
    modified_text = insert_citation_markers(response.text or "", citations)
    sources_gathered = [item for citation in citations for item in citation["segments"]]

    return {
        "sources_gathered": sources_gathered,
        "search_query": [state["search_query"]],
        "web_research_result": [modified_text],
    }
