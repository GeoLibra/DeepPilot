"""Graph node for final citation availability and grounding reflection."""

from __future__ import annotations

import json
import os

from dotenv import load_dotenv
from langchain_core.runnables import RunnableConfig

from agent.citation_audit import audit_citations
from agent.configuration import Configuration
from agent.model_registry import invoke_text_model
from agent.prompts import citation_repair_instructions
from agent.state import OverallState

load_dotenv()

web_research_api_key = os.getenv("WEB_RESEARCH_API_KEY") or os.getenv("GEMINI_API_KEY")
if web_research_api_key is None:
    raise ValueError("WEB_RESEARCH_API_KEY is not set")


def verify_citations(state: OverallState, config: RunnableConfig) -> OverallState:
    """Audit final-answer citations and run one bounded repair pass when needed."""
    final_answer = state.get("final_answer", "")
    audit = audit_citations(final_answer, state.get("sources_gathered", []))
    if not audit["summary"]["requires_revision"]:
        return {"citation_audit": audit}

    configurable = Configuration.from_runnable_config(config)
    reasoning_model = state.get("reasoning_model") or configurable.answer_model
    formatted_prompt = citation_repair_instructions.format(
        answer=final_answer,
        citation_audit=json.dumps(audit, indent=2, ensure_ascii=False),
    )
    result = invoke_text_model(
        reasoning_model,
        formatted_prompt,
        temperature=0,
        api_key=web_research_api_key,
    )
    repaired_answer = result.content or final_answer
    repaired_audit = audit_citations(repaired_answer, state.get("sources_gathered", []))

    return {
        "final_answer": repaired_answer,
        "citation_audit": {
            "initial": audit,
            "repaired": repaired_audit,
        },
    }
