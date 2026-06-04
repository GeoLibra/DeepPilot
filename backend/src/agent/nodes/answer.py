import os

from dotenv import load_dotenv
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig

from agent.configuration import Configuration
from agent.model_registry import invoke_structured_model, invoke_text_model
from agent.nodes.research_plan import get_research_context
from agent.prompts import (
    answer_instructions,
    get_current_date,
    visualization_instructions,
)
from agent.state import OverallState
from agent.tools_and_schemas import VisualBlocks
from agent.utils import get_successful_web_research_results

load_dotenv()

web_research_api_key = os.getenv("WEB_RESEARCH_API_KEY") or os.getenv("GEMINI_API_KEY")
if web_research_api_key is None:
    raise ValueError("WEB_RESEARCH_API_KEY is not set")


def finalize_answer(state: OverallState, config: RunnableConfig):
    """LangGraph node that finalizes the research summary.

    Prepares the final output by deduplicating and formatting sources, then
    combining them with the running summary to create a well-structured
    research report with proper citations.

    Args:
        state: Current graph state containing the running summary and sources gathered

    Returns:
        Dictionary with state update, including running_summary key containing the formatted final summary with sources
    """
    configurable = Configuration.from_runnable_config(config)
    reasoning_model = state.get("reasoning_model") or configurable.answer_model

    # Format the prompt
    current_date = get_current_date()
    web_research_results = state.get("web_research_result", [])
    successful_results = get_successful_web_research_results(web_research_results)
    formatted_prompt = answer_instructions.format(
        current_date=current_date,
        research_topic=get_research_context(state),
        summaries="\n---\n\n".join(successful_results or web_research_results),
    )

    result = invoke_text_model(
        reasoning_model,
        formatted_prompt,
        temperature=0,
        api_key=web_research_api_key,
    )

    # Replace the short urls with the original urls and add all used urls to the sources_gathered
    unique_sources = []
    final_answer = result.content or ""
    for source in state["sources_gathered"]:
        short_url = source.get("short_url")
        if short_url and short_url in final_answer:
            final_answer = final_answer.replace(short_url, source["value"])
            unique_sources.append(source)

    return {
        "final_answer": final_answer,
        "sources_gathered": unique_sources,
    }


def visualize_answer(state: OverallState, config: RunnableConfig):
    """Create optional visual blocks and attach them to the final AI message."""
    configurable = Configuration.from_runnable_config(config)
    final_answer = state.get("final_answer", "")

    if not final_answer.strip():
        return {"messages": [AIMessage(content=final_answer)], "visual_blocks": []}

    formatted_prompt = visualization_instructions.format(
        research_topic=get_research_context(state),
        answer=final_answer,
    )

    try:
        visual_model = state.get("reasoning_model") or configurable.reflection_model
        result = invoke_structured_model(
            visual_model,
            formatted_prompt,
            VisualBlocks,
            temperature=0,
            api_key=web_research_api_key,
        )
        visual_blocks = [
            block.model_dump()
            for block in sorted(result.blocks, key=lambda block: block.priority)
            if block.syntax.strip()
        ][:3]
    except Exception as exc:
        print(f"WARN: Failed to generate visual blocks: {exc}")
        visual_blocks = []

    return {
        "messages": [
            AIMessage(
                content=final_answer,
                additional_kwargs={"visual_blocks": visual_blocks},
            )
        ],
        "visual_blocks": visual_blocks,
    }
