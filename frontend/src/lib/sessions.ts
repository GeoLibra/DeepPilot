import type { Client, Message, Metadata, Thread } from "@langchain/langgraph-sdk";

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
};

export type LastRunDetails = {
  input: string;
  effort: string;
  model: string;
};

const APP_METADATA_KEY = "deeppilot";
const DEFAULT_SESSION_TITLE = "Untitled session";
const SESSION_TITLE_LENGTH = 56;
const SESSION_PREVIEW_LENGTH = 120;

function getMetadataString(metadata: Metadata | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function stringifyContentPart(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringifyContentPart).join("");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    if (Array.isArray(record.content)) {
      return record.content.map(stringifyContentPart).join("");
    }
  }
  return JSON.stringify(value);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function getMessageText(message: Message) {
  return normalizeWhitespace(stringifyContentPart(message.content));
}

function truncateText(value: string, maxLength: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

export function deriveSessionTitle(input: string) {
  return truncateText(input, SESSION_TITLE_LENGTH) || DEFAULT_SESSION_TITLE;
}

function getThreadMessages(thread: Thread<AgentState>) {
  return Array.isArray(thread.values?.messages) ? thread.values.messages : [];
}

function isDeepPilotThread(thread: Thread<AgentState>) {
  const metadataApp = getMetadataString(thread.metadata, "app");
  if (metadataApp === APP_METADATA_KEY) return true;
  return getThreadMessages(thread).length > 0;
}

function getFirstHumanMessage(messages: Message[]) {
  return messages.find((message) => message.type === "human");
}

function getLastMessage(messages: Message[]) {
  return messages.length > 0 ? messages[messages.length - 1] : undefined;
}

export function threadToSessionSummary(thread: Thread<AgentState>): SessionSummary {
  const messages = getThreadMessages(thread);
  const titleFromMetadata = getMetadataString(thread.metadata, "title");
  const previewFromMetadata = getMetadataString(
    thread.metadata,
    "last_message_preview"
  );
  const firstHumanText = getFirstHumanMessage(messages)
    ? getMessageText(getFirstHumanMessage(messages)!)
    : "";
  const lastMessageText = getLastMessage(messages)
    ? getMessageText(getLastMessage(messages)!)
    : "";

  return {
    id: thread.thread_id,
    title:
      truncateText(titleFromMetadata || firstHumanText, SESSION_TITLE_LENGTH) ||
      DEFAULT_SESSION_TITLE,
    preview:
      truncateText(
        previewFromMetadata || lastMessageText || firstHumanText,
        SESSION_PREVIEW_LENGTH
      ) || "No messages yet",
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    status: thread.status,
    messageCount: messages.length,
    model: getMetadataString(thread.metadata, "last_model"),
    effort: getMetadataString(thread.metadata, "last_effort"),
  };
}

export async function listSessions(client: Client<AgentState>) {
  const threads = await client.threads.search<AgentState>({
    limit: 100,
    sortBy: "updated_at",
    sortOrder: "desc",
  });

  return threads.filter(isDeepPilotThread).map(threadToSessionSummary);
}

export async function getSessionMessages(
  client: Client<AgentState>,
  threadId: string
) {
  const thread = await client.threads.get<AgentState>(threadId);
  return getThreadMessages(thread);
}

async function mergeThreadMetadata(
  client: Client<AgentState>,
  threadId: string,
  metadata: Metadata
) {
  const thread = await client.threads.get<AgentState>(threadId);
  await client.threads.update(threadId, {
    metadata: {
      ...(thread.metadata ?? {}),
      ...metadata,
      app: APP_METADATA_KEY,
    },
  });
}

export async function renameSession(
  client: Client<AgentState>,
  threadId: string,
  title: string
) {
  await mergeThreadMetadata(client, threadId, {
    title: deriveSessionTitle(title),
    title_source: "user",
  });
}

export async function updateSessionAfterRun(
  client: Client<AgentState>,
  threadId: string,
  messages: Message[],
  lastRunDetails: LastRunDetails | null
) {
  const thread = await client.threads.get<AgentState>(threadId);
  const existingTitle = getMetadataString(thread.metadata, "title");
  const titleSource = getMetadataString(thread.metadata, "title_source");
  const firstHumanText = getFirstHumanMessage(messages)
    ? getMessageText(getFirstHumanMessage(messages)!)
    : "";
  const lastMessageText = getLastMessage(messages)
    ? getMessageText(getLastMessage(messages)!)
    : "";

  const shouldKeepTitle = existingTitle && titleSource === "user";
  const fallbackTitle = firstHumanText || lastRunDetails?.input || "";

  await client.threads.update(threadId, {
    metadata: {
      ...(thread.metadata ?? {}),
      app: APP_METADATA_KEY,
      title: shouldKeepTitle
        ? existingTitle
        : existingTitle || deriveSessionTitle(fallbackTitle),
      title_source: titleSource || "auto",
      last_message_preview: truncateText(
        lastMessageText || lastRunDetails?.input || fallbackTitle,
        SESSION_PREVIEW_LENGTH
      ),
      last_model: lastRunDetails?.model,
      last_effort: lastRunDetails?.effort,
    },
  });
}

export function filterSessions(sessions: SessionSummary[], query: string) {
  const normalizedQuery = normalizeWhitespace(query).toLowerCase();
  if (!normalizedQuery) return sessions;

  return sessions.filter((session) => {
    const haystack = [
      session.title,
      session.preview,
      session.model,
      session.effort,
      session.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
