import os

from dotenv import load_dotenv
from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from agent.configuration import Configuration
from agent.model_registry import invoke_structured_model
from agent.prompts import get_current_date, research_plan_instructions
from agent.state import OverallState
from agent.tools_and_schemas import ResearchPlan
from agent.utils import get_research_topic

load_dotenv()

web_research_api_key = os.getenv("WEB_RESEARCH_API_KEY") or os.getenv("GEMINI_API_KEY")
if web_research_api_key is None:
    raise ValueError("WEB_RESEARCH_API_KEY is not set")


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
