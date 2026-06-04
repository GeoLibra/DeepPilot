"""Prompt templates used by the DeepPilot research graph."""

from datetime import datetime


# Get current date in a readable format
def get_current_date():
    """Return the current date in a human-readable prompt format."""
    return datetime.now().strftime("%B %d, %Y")


query_writer_instructions = """Your goal is to generate sophisticated and diverse web search queries. These queries are intended for an advanced automated web research tool capable of analyzing complex results, following links, and synthesizing information.

Instructions:
- Always prefer a single search query, only add another query if the original question requests multiple aspects or elements and one query is not enough.
- Each query should focus on one specific aspect of the original question.
- Don't produce more than {number_queries} queries.
- Queries should be diverse, if the topic is broad, generate more than 1 query.
- Don't generate multiple similar queries, 1 is enough.
- Query should ensure that the most current information is gathered. The current date is {current_date}.

Format: 
- Format your response as a JSON object with ALL two of these exact keys:
   - "rationale": Brief explanation of why these queries are relevant
   - "query": A list of search queries

Example:

Topic: What revenue grew more last year apple stock or the number of people buying an iphone
```json
{{
    "rationale": "To answer this comparative growth question accurately, we need specific data points on Apple's stock performance and iPhone sales metrics. These queries target the precise financial information needed: company revenue trends, product-specific unit sales figures, and stock price movement over the same fiscal period for direct comparison.",
    "query": ["Apple total revenue growth fiscal year 2026", "iPhone unit sales growth fiscal year 2026", "Apple stock price growth fiscal year 2026"],
}}
```

Context: {research_topic}"""


research_plan_instructions = """Create a concise research plan for the user's topic before any web research is performed.

Instructions:
- The current date is {current_date}.
- Prefer the same language as the user's request.
- Do not answer the user's question yet.
- Make the plan specific enough for the user to review and modify.
- Include targeted website/search research work, analysis work, and the final report structure.
- Keep each step short and concrete.

Output Format:
- Format your response as a JSON object with these exact keys:
   - "title": Short plan title.
   - "objective": What the research will answer.
   - "research_steps": A list of concrete web research steps.
   - "analysis_steps": A list of concrete analysis steps after sources are gathered.
   - "report_outline": A list of final report sections or deliverables.

User Topic:
{research_topic}
"""


web_searcher_instructions = """Conduct targeted web searches to gather the most recent, credible information on "{research_topic}" and synthesize it into a verifiable text artifact.

Instructions:
- Query should ensure that the most current information is gathered. The current date is {current_date}.
- Conduct multiple, diverse searches to gather comprehensive information.
- Consolidate key findings while meticulously tracking the source(s) for each specific piece of information.
- The output should be a well-written summary or report based on your search findings. 
- Only include the information found in the search results, don't make up any information.

Research Topic:
{research_topic}
"""

reflection_instructions = """You are an expert research assistant analyzing summaries about "{research_topic}".

Instructions:
- Identify knowledge gaps or areas that need deeper exploration and generate a follow-up query. (1 or multiple).
- If provided summaries are sufficient to answer the user's question, don't generate a follow-up query.
- If there is a knowledge gap, generate a follow-up query that would help expand your understanding.
- Focus on technical details, implementation specifics, or emerging trends that weren't fully covered.

Requirements:
- Ensure the follow-up query is self-contained and includes necessary context for web search.

Output Format:
- Format your response as a JSON object with these exact keys:
   - "is_sufficient": true or false
   - "knowledge_gap": Describe what information is missing or needs clarification
   - "follow_up_queries": Write a specific question to address this gap

Example:
```json
{{
    "is_sufficient": true, // or false
    "knowledge_gap": "The summary lacks information about performance metrics and benchmarks", // "" if is_sufficient is true
    "follow_up_queries": ["What are typical performance benchmarks and metrics used to evaluate [specific technology]?"] // [] if is_sufficient is true
}}
```

Reflect carefully on the Summaries to identify knowledge gaps and produce a follow-up query. Then, produce your output following this JSON format:

Summaries:
{summaries}
"""

answer_instructions = """Generate a high-quality answer to the user's question based on the provided summaries.

Instructions:
- The current date is {current_date}.
- You are the final step of a multi-step research process, don't mention that you are the final step. 
- You have access to all the information gathered from the previous steps.
- You have access to the user's question.
- Generate a high-quality answer to the user's question based on the provided summaries and the user's question.
- Cite only source URLs present in the Summaries, using markdown format (e.g. [apnews](https://vertexaisearch.cloud.google.com/id/1-0)). Each citation must support the specific claim it is attached to.
- If the summaries only indicate web research failures and contain no sourced evidence, say that web research is currently unavailable and ask the user to retry.

User Context:
- {research_topic}

Summaries:
{summaries}"""


citation_repair_instructions = """You are a citation quality reviewer repairing a final research answer.

Goal:
- Rewrite the answer so it no longer presents dead, invalid, or unsupported citations as trustworthy evidence.
- Preserve useful content that remains supported by available citations.

Rules:
- Do not invent replacement URLs.
- If a cited URL is `not_found`, `invalid_url`, `timeout`, `server_error`, `client_error`, or `request_error`, remove that citation and remove or soften the surrounding claim unless another cited source in the answer supports it.
- If a cited URL is `blocked` or `rate_limited`, do not call it a 404. Either mark the source as inaccessible for automated verification or remove the citation if the claim cannot be supported.
- A URL being reachable is not enough; keep citations only where they support the surrounding claim.
- Keep the user's language and the original answer structure as much as possible.
- Return only the revised answer, with no audit commentary.

Final Answer:
{answer}

Citation Audit:
{citation_audit}
"""


visualization_instructions = """Create optional visual presentation blocks for the final answer.

Your job:
- Decide whether the answer benefits from visual formatting at all.
- Generate structured visual blocks only when they clarify the answer better than plain markdown.
- Do not force a T8 block, an infographic block, or both. The right output may be an empty list.
- Do not invent facts, numbers, categories, dates, or relationships.
- Keep the final written answer separate; these blocks are supplementary.

Available block types:
1. t8
   Use for narrative text visualization: metrics, dimensions, trends, ratios, rankings, deltas, and time descriptions embedded in prose.
   Also use T8 for compact explanatory text after a figure/diagram when it contains measurable facts, trends, comparisons, rankings, or time references.
   Syntax is T8 markdown.
   Useful entity annotations:
   - [Revenue](metric_name)
   - [$1.2B](metric_value, origin=1200000000)
   - [up 8.5%](delta_value, assessment=positive)
   - [down 2.1%](delta_value, assessment=negative)
   - [Asia Pacific](dim_value)
   - [2026](time_desc)
   - [ranked #1](rank)

2. infographic
   Use for structural summaries: key findings, timelines, steps, comparisons, hierarchies, or cause-effect maps.
   Syntax is AntV Infographic syntax.
   Prefer these templates:
   - list-column-done-list for key findings
   - list-grid-compact-card for grouped ideas
   - sequence-timeline-done-list for chronological events
   - sequence-steps-badge-card for process or step-by-step answers
   - list-row-simple-horizontal-arrow for flows

Infographic syntax example:
infographic list-column-done-list
data
  title Key findings
  lists
    - label Finding 1
      desc Short explanation
    - label Finding 2
      desc Short explanation

Another example (list-grid-compact-card):
infographic list-grid-compact-card
data
  title Category overview
  cards
    - label Category A
      desc Brief summary of category A
    - label Category B
      desc Brief summary of category B

IMPORTANT: Always use "- label" for item headings and "desc" for descriptions. Do NOT use "- title" instead of "- label".

Rules:
- Return at most 3 blocks, and return fewer when fewer are useful.
- If the answer is short, mostly conversational, or already clear as markdown, return an empty blocks list.
- Choose the block type from the content:
  - Use T8 only when there are concrete metrics, named dimensions, deltas, rankings, ratios, or dates worth highlighting.
  - Use Infographic only when the answer has structure that benefits from a visual list, flow, timeline, hierarchy, or comparison.
  - Use both only when each block explains different content; do not duplicate the same points in both formats.
- Prefer the user's language.
- For T8, keep syntax concise and readable, around 3-8 lines.
- For Infographic, keep labels under 24 characters and descriptions under 80 characters.
- Do not include citation URLs inside T8 or Infographic syntax.

User question:
{research_topic}

Final answer:
{answer}
"""
