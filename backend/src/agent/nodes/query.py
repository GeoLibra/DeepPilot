import os

from dotenv import load_dotenv
from langchain_core.runnables import RunnableConfig

from agent.configuration import Configuration
from agent.model_registry import invoke_structured_model
from agent.prompts import get_current_date, query_writer_instructions
from agent.state import OverallState, QueryGenerationState
from agent.tools_and_schemas import SearchQueryList
from agent.nodes.research_plan import get_research_context

load_dotenv()

web_research_api_key = os.getenv("WEB_RESEARCH_API_KEY") or os.getenv("GEMINI_API_KEY")
if web_research_api_key is None:
    raise ValueError("WEB_RESEARCH_API_KEY is not set")


def generate_query(state: OverallState, config: RunnableConfig) -> QueryGenerationState:
    """LangGraph node that generates search queries based on the User's question.

    Uses the configured query model to create optimized web research queries based on
    the user's question.

    Args:
        state: Current graph state containing the User's question
        config: Configuration for the runnable, including LLM provider settings

    Returns:
        Dictionary with state update, including search_query key containing the generated queries
    """
    configurable = Configuration.from_runnable_config(config)

    # check for custom initial search query count
    if state.get("initial_search_query_count") is None:
        state["initial_search_query_count"] = configurable.number_of_initial_queries

    # Format the prompt
    current_date = get_current_date()
    formatted_prompt = query_writer_instructions.format(
        current_date=current_date,
        research_topic=get_research_context(state),
        number_queries=state["initial_search_query_count"],
    )
    # Generate the search queries
    query_model = state.get("reasoning_model") or configurable.query_generator_model
    result = invoke_structured_model(
        query_model,
        formatted_prompt,
        SearchQueryList,
        temperature=1.0,
        api_key=web_research_api_key,
    )
    return {"search_query": result.query}
