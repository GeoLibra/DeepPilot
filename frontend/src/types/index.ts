import type { Message } from "@langchain/langgraph-sdk";

export type ModelOption = {
  name: string;
  display_name: string;
  model?: string;
  supports_thinking?: boolean;
  supports_vision?: boolean;
};

export type VisualBlock = {
  type: "t8" | "infographic";
  title: string;
  purpose?: string;
  syntax: string;
  priority?: number;
};

export type AgentState = {
  messages: Message[];
  initial_search_query_count: number;
  max_research_loops: number;
  reasoning_model: string;
};

export type SessionSummary = {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  messageCount: number;
  model?: string;
  effort?: string;
  branchedFrom?: string;
  branchedAt?: string;
};

export type LastRunDetails = {
  input: string;
  effort: string;
  model: string;
};

export type SourceEvent = {
  label?: string;
};

export type StreamUpdateEvent = {
  generate_query?: {
    search_query?: string[];
  };
  web_research?: {
    sources_gathered?: SourceEvent[];
  };
  reflection?: unknown;
  finalize_answer?: unknown;
  visualize_answer?: {
    visual_blocks?: unknown[];
  };
};
