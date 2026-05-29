import type { Client, Message, Metadata, Thread } from "@langchain/langgraph-sdk";
import type { AgentState, SessionSummary, LastRunDetails } from "@/types";
import {
  APP_METADATA_KEY,
  DEFAULT_SESSION_TITLE,
  SESSION_TITLE_LENGTH,
  SESSION_PREVIEW_LENGTH,
} from "./constants";
import { getPreviewMessageText, normalizeWhitespace } from "./message-utils";

function getMetadataString(metadata: Metadata | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
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
    ? getPreviewMessageText(getFirstHumanMessage(messages)!)
    : "";
  const lastMessageText = getLastMessage(messages)
    ? getPreviewMessageText(getLastMessage(messages)!)
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
    ? getPreviewMessageText(getFirstHumanMessage(messages)!)
    : "";
  const lastMessageText = getLastMessage(messages)
    ? getPreviewMessageText(getLastMessage(messages)!)
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
