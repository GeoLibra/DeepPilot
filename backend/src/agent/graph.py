from langgraph.graph import END, START, StateGraph

from agent.configuration import Configuration
from agent.state import OverallState

from agent.nodes.research_plan import plan_research
from agent.nodes.query import generate_query
from agent.nodes.web_research import web_research, continue_to_web_research
from agent.nodes.reflection import reflection, evaluate_research
from agent.nodes.answer import finalize_answer, visualize_answer

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
