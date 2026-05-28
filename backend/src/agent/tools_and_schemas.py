from typing import List, Literal
from pydantic import BaseModel, Field


class SearchQueryList(BaseModel):
    query: List[str] = Field(
        description="A list of search queries to be used for web research."
    )
    rationale: str = Field(
        description="A brief explanation of why these queries are relevant to the research topic."
    )


class Reflection(BaseModel):
    is_sufficient: bool = Field(
        description="Whether the provided summaries are sufficient to answer the user's question."
    )
    knowledge_gap: str = Field(
        description="A description of what information is missing or needs clarification."
    )
    follow_up_queries: List[str] = Field(
        description="A list of follow-up queries to address the knowledge gap."
    )


class VisualBlock(BaseModel):
    type: Literal["t8", "infographic"] = Field(
        description="The renderer to use only when this visual block genuinely improves the answer."
    )
    title: str = Field(description="Short display title for the visual block.")
    purpose: str = Field(
        description="Why this block helps explain the answer, e.g. metrics, timeline, comparison, or key findings."
    )
    syntax: str = Field(
        description="Renderer-specific syntax. Use T8 markdown for t8, or AntV Infographic syntax for infographic."
    )
    priority: int = Field(
        default=0,
        description="Lower numbers should be displayed first.",
    )


class VisualBlocks(BaseModel):
    blocks: List[VisualBlock] = Field(
        default_factory=list,
        description="Optional content-driven visual blocks. Return an empty list when markdown is clearer.",
    )
