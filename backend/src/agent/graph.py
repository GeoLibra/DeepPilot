import os

from dotenv import load_dotenv
from google.genai import Client
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send, interrupt

from agent.configuration import Configuration
from agent.model_registry import invoke_structured_model, invoke_text_model
from agent.prompts import (
    answer_instructions,
    get_current_date,
    query_writer_instructions,
    reflection_instructions,
    research_plan_instructions,
    visualization_instructions,
    web_searcher_instructions,
)
from agent.state import (
    OverallState,
    QueryGenerationState,
    ReflectionState,
    WebSearchState,
)
from agent.tools_and_schemas import (
    Reflection,
    ResearchPlan,
    SearchQueryList,
    VisualBlocks,
)
from agent.utils import (
    get_citations,
    get_research_topic,
    insert_citation_markers,
    resolve_urls,
)

load_dotenv()

web_research_api_key = os.getenv("WEB_RESEARCH_API_KEY") or os.getenv("GEMINI_API_KEY")
if web_research_api_key is None:
    raise ValueError("WEB_RESEARCH_API_KEY is not set")

# Used for the grounded web research adapter.
genai_client = Client(api_key=web_research_api_key)


def format_research_plan_markdown(plan: dict) -> str:
    """Render a structured research plan into editable markdown."""
    title = str(plan.get("title") or "Research plan").strip()
    objective = str(plan.get("objective") or "").strip()
    research_steps = plan.get("research_steps") or []
    analysis_steps = plan.get("analysis_steps") or []
    report_outline = plan.get("report_outline") or []
    estimated_minutes = plan.get("estimated_minutes")

    lines = [f"# {title}"]
    if objective:
        lines.extend(["", f"## Objective", objective])
    if research_steps:
        lines.extend(["", "## Research websites"])
        lines.extend(f"{idx}. {step}" for idx, step in enumerate(research_steps, 1))
    if analysis_steps:
        lines.extend(["", "## Analyze results"])
        lines.extend(f"{idx}. {step}" for idx, step in enumerate(analysis_steps, 1))
    if report_outline:
        lines.extend(["", "## Generate report"])
        lines.extend(f"{idx}. {section}" for idx, section in enumerate(report_outline, 1))
    if estimated_minutes:
        lines.extend(["", f"Estimated preparation time: {estimated_minutes} minutes"])

    return "\n".join(lines).strip()


def normalize_research_plan_resume(resume_value: object, fallback_plan: dict) -> dict:
    """Coerce the user's approval or edits into the plan stored in graph state."""
    plan = dict(fallback_plan)
    action = "approve"
    plan_markdown = str(plan.get("markdown") or "").strip()

    if isinstance(resume_value, str) and resume_value.strip():
        plan_markdown = resume_value.strip()
        action = "modify"
    elif isinstance(resume_value, dict):
        action = str(resume_value.get("action") or action)
        incoming_plan = resume_value.get("plan")
        if isinstance(incoming_plan, dict):
            plan.update(incoming_plan)
        incoming_markdown = resume_value.get("plan_markdown")
        if isinstance(incoming_markdown, str) and incoming_markdown.strip():
            plan_markdown = incoming_markdown.strip()

    if not plan_markdown:
        plan_markdown = format_research_plan_markdown(plan)

    plan["markdown"] = plan_markdown
    plan["review_action"] = action
    return plan


def get_research_context(state: OverallState) -> str:
    """Return the original topic plus the user-approved research plan."""
    topic = get_research_topic(state["messages"])
    research_plan = state.get("research_plan") or {}
    plan_markdown = research_plan.get("markdown") if isinstance(research_plan, dict) else None
    if not plan_markdown:
        return topic
    return f"{topic}\n\nUser-approved research plan:\n{plan_markdown}"


# Nodes
def plan_research(state: OverallState, config: RunnableConfig) -> OverallState:
    """Create a research plan and pause for user review before web research."""
    configurable = Configuration.from_runnable_config(config)
    reasoning_model = state.get("reasoning_model") or configurable.query_generator_model

    formatted_prompt = research_plan_instructions.format(
        current_date=get_current_date(),
        research_topic=get_research_topic(state["messages"]),
    )
    result = invoke_structured_model(
        reasoning_model,
        formatted_prompt,
        ResearchPlan,
        temperature=0,
        api_key=web_research_api_key,
    )
    plan = result.model_dump()
    plan["markdown"] = format_research_plan_markdown(plan)

    resume_value = interrupt({"type": "research_plan_review", "plan": plan})
    approved_plan = normalize_research_plan_resume(resume_value, plan)
    return {"research_plan": approved_plan}


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


def reflection(state: OverallState, config: RunnableConfig) -> ReflectionState:
    """LangGraph node that identifies knowledge gaps and generates potential follow-up queries.

    Analyzes the current summary to identify areas for further research and generates
    potential follow-up queries. Uses structured output to extract
    the follow-up query in JSON format.

    Args:
        state: Current graph state containing the running summary and research topic
        config: Configuration for the runnable, including LLM provider settings

    Returns:
        Dictionary with state update, including search_query key containing the generated follow-up query
    """
    configurable = Configuration.from_runnable_config(config)
    # Increment the research loop count and get the reasoning model
    state["research_loop_count"] = state.get("research_loop_count", 0) + 1
    reasoning_model = state.get("reasoning_model", configurable.reflection_model)

    # Format the prompt
    current_date = get_current_date()
    formatted_prompt = reflection_instructions.format(
        current_date=current_date,
        research_topic=get_research_context(state),
        summaries="\n\n---\n\n".join(state["web_research_result"]),
    )
    result = invoke_structured_model(
        reasoning_model,
        formatted_prompt,
        Reflection,
        temperature=1.0,
        api_key=web_research_api_key,
    )

    return {
        "is_sufficient": result.is_sufficient,
        "knowledge_gap": result.knowledge_gap,
        "follow_up_queries": result.follow_up_queries,
        "research_loop_count": state["research_loop_count"],
        "number_of_ran_queries": len(state["search_query"]),
    }


def evaluate_research(
    state: ReflectionState,
    config: RunnableConfig,
) -> OverallState:
    """LangGraph routing function that determines the next step in the research flow.

    Controls the research loop by deciding whether to continue gathering information
    or to finalize the summary based on the configured maximum number of research loops.

    Args:
        state: Current graph state containing the research loop count
        config: Configuration for the runnable, including max_research_loops setting

    Returns:
        String literal indicating the next node to visit ("web_research" or "finalize_summary")
    """
    configurable = Configuration.from_runnable_config(config)
    max_research_loops = (
        state.get("max_research_loops")
        if state.get("max_research_loops") is not None
        else configurable.max_research_loops
    )
    if state["is_sufficient"] or state["research_loop_count"] >= max_research_loops:
        return "finalize_answer"
    else:
        return [
            Send(
                "web_research",
                {
                    "search_query": follow_up_query,
                    "id": state["number_of_ran_queries"] + int(idx),
                },
            )
            for idx, follow_up_query in enumerate(state["follow_up_queries"])
        ]


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
    formatted_prompt = answer_instructions.format(
        current_date=current_date,
        research_topic=get_research_context(state),
        summaries="\n---\n\n".join(state["web_research_result"]),
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


# Create our Agent Graph
builder = StateGraph(OverallState, config_schema=Configuration)

# Define the nodes we will cycle between
builder.add_node("plan_research", plan_research)
builder.add_node("generate_query", generate_query)
builder.add_node("web_research", web_research)
builder.add_node("reflection", reflection)
builder.add_node("finalize_answer", finalize_answer)
builder.add_node("visualize_answer", visualize_answer)

# Set the entrypoint as `plan_research`
# This means that this node is the first one called
builder.add_edge(START, "plan_research")
builder.add_edge("plan_research", "generate_query")
# Add conditional edge to continue with search queries in a parallel branch
builder.add_conditional_edges(
    "generate_query", continue_to_web_research, ["web_research"]
)
# Reflect on the web research
builder.add_edge("web_research", "reflection")
# Evaluate the research
builder.add_conditional_edges(
    "reflection", evaluate_research, ["web_research", "finalize_answer"]
)
# Finalize the answer and attach optional visual blocks
builder.add_edge("finalize_answer", "visualize_answer")
builder.add_edge("visualize_answer", END)

graph = builder.compile(name="pro-search-agent")
