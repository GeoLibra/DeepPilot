import type { Client, Message, Metadata, Thread } from "@langchain/langgraph-sdk";
import type { AgentState, SessionSummary, LastRunDetails } from "@/types";
import {
  APP_METADATA_KEY,
  DEFAULT_MODEL_NAME,
  DEFAULT_SESSION_TITLE,
  SESSION_TITLE_LENGTH,
  SESSION_PREVIEW_LENGTH,
} from "./constants";
import {
  getCleanMessageText,
  getPreviewMessageText,
  isInternalAgentMessage,
  normalizeWhitespace,
} from "./message-utils";

const SESSION_URL_PARAM = "thread";
const LEGACY_SESSION_URL_PARAM = "session";
const MESSAGE_URL_PARAM = "message";
const BRANCH_TITLE_SUFFIX = " (branch)";

function getMetadataString(metadata: Metadata | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function truncateText(value: string, maxLength: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
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

function getLastVisibleMessage(messages: Message[]) {
  return [...messages].reverse().find((message) => !isInternalAgentMessage(message));
}

function getMessageIndex(messages: Message[], messageId: string) {
  return messages.findIndex((message) => message.id === messageId);
}

function getMessagesThroughMessage(messages: Message[], messageId: string) {
  const index = getMessageIndex(messages, messageId);
  if (index < 0) return messages;
  return messages.slice(0, index + 1);
}

function getTurnMessages(messages: Message[], messageId: string) {
  const visibleMessages = messages.filter(
    (message) => !isInternalAgentMessage(message)
  );
  const targetIndex = getMessageIndex(visibleMessages, messageId);
  if (targetIndex < 0) return [];

  const targetMessage = visibleMessages[targetIndex];
  const turnMessages: Message[] = [];
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const message = visibleMessages[index];
    if (message.type === "human") {
      turnMessages.push(message);
      break;
    }
    if (message.type === "ai") break;
  }
  turnMessages.push(targetMessage);
  return turnMessages;
}

function getBranchTitle(title: string) {
  const baseTitle = title || DEFAULT_SESSION_TITLE;
  if (baseTitle.endsWith(BRANCH_TITLE_SUFFIX)) {
    return truncateText(baseTitle, SESSION_TITLE_LENGTH);
  }

  const maxBaseLength = SESSION_TITLE_LENGTH - BRANCH_TITLE_SUFFIX.length;
  return `${truncateText(baseTitle, maxBaseLength)}${BRANCH_TITLE_SUFFIX}`;
}

function getMessageBranchTitle(title: string) {
  return getBranchTitle(title || DEFAULT_SESSION_TITLE);
}

function getSessionUrl() {
  return new URL(window.location.href);
}

function formatExportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function sanitizeFilename(value: string) {
  return (
    normalizeWhitespace(value)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\.+$/g, "")
      .slice(0, 80)
      .trim() || "deeppilot-session"
  );
}

function getMessageRole(message: Message) {
  switch (message.type) {
    case "human":
      return "User";
    case "ai":
      return "DeepPilot";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    default:
      return message.type || "Message";
  }
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path for non-secure local origins.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Clipboard copy failed.");
  } finally {
    document.body.removeChild(textarea);
  }
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
  const lastVisibleMessage = getLastVisibleMessage(messages);
  const lastMessageText = lastVisibleMessage
    ? getPreviewMessageText(lastVisibleMessage)
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
    branchedFrom: getMetadataString(thread.metadata, "branched_from"),
    branchedAt: getMetadataString(thread.metadata, "branched_at"),
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

export async function branchSessionFromMessage(
  client: Client<AgentState>,
  threadId: string,
  messageId: string,
  messages: Message[],
  sourceSession?: SessionSummary
) {
  const branchedMessages = getMessagesThroughMessage(messages, messageId);
  const firstHumanText = getFirstHumanMessage(branchedMessages)
    ? getPreviewMessageText(getFirstHumanMessage(branchedMessages)!)
    : "";
  const lastVisibleText = getLastVisibleMessage(branchedMessages)
    ? getPreviewMessageText(getLastVisibleMessage(branchedMessages)!)
    : "";
  const title = sourceSession?.title || firstHumanText || DEFAULT_SESSION_TITLE;

  const newThread = await client.threads.create({
    metadata: {
      app: APP_METADATA_KEY,
      title: getMessageBranchTitle(title),
      title_source: "auto",
      branched_from: threadId,
      branched_from_message: messageId,
      branched_at: new Date().toISOString(),
      last_message_preview: truncateText(
        lastVisibleText || firstHumanText,
        SESSION_PREVIEW_LENGTH
      ),
      last_model: sourceSession?.model,
      last_effort: sourceSession?.effort,
    },
  });

  await client.threads.updateState(newThread.thread_id, {
    values: {
      messages: branchedMessages,
      initial_search_query_count: 3,
      max_research_loops: 3,
      reasoning_model: sourceSession?.model || DEFAULT_MODEL_NAME,
    },
    asNode: "visualize_answer",
  });

  return {
    threadId: newThread.thread_id,
    messages: branchedMessages,
  };
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
  const lastVisibleMessage = getLastVisibleMessage(messages);
  const lastMessageText = lastVisibleMessage
    ? getPreviewMessageText(lastVisibleMessage)
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

export function getSessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get(SESSION_URL_PARAM) || params.get(LEGACY_SESSION_URL_PARAM);
}

export function setSessionIdInUrl(threadId: string | null) {
  const url = getSessionUrl();
  if (threadId) {
    url.searchParams.set(SESSION_URL_PARAM, threadId);
    url.searchParams.delete(LEGACY_SESSION_URL_PARAM);
  } else {
    url.searchParams.delete(SESSION_URL_PARAM);
    url.searchParams.delete(LEGACY_SESSION_URL_PARAM);
  }
  url.searchParams.delete(MESSAGE_URL_PARAM);

  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

export function getMessageIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get(MESSAGE_URL_PARAM);
}

export function getMessageElementId(messageId: string) {
  return `message-${encodeURIComponent(messageId)}`;
}

export function getMessageShareUrl(threadId: string, messageId: string) {
  const url = getSessionUrl();
  url.searchParams.set(SESSION_URL_PARAM, threadId);
  url.searchParams.set(MESSAGE_URL_PARAM, messageId);
  url.searchParams.delete(LEGACY_SESSION_URL_PARAM);
  return url.toString();
}

export async function copyMessageShareUrl(threadId: string, messageId: string) {
  const shareUrl = getMessageShareUrl(threadId, messageId);
  await writeClipboardText(shareUrl);
  return shareUrl;
}

export function buildMessageExportMarkdown(
  session: SessionSummary,
  messages: Message[],
  messageId: string
) {
  const turnMessages = getTurnMessages(messages, messageId);
  const metadataLines = [
    `- Session ID: \`${session.id}\``,
    `- Message ID: \`${messageId}\``,
    `- Exported: ${formatExportDate(new Date().toISOString())}`,
    session.model ? `- Model: ${session.model}` : null,
    session.effort ? `- Effort: ${session.effort}` : null,
  ].filter(Boolean);

  const messageSections = turnMessages.map((message) => {
    const messageText = getCleanMessageText(message).trim() || "_No text content_";
    return [`## ${getMessageRole(message)}`, "", messageText].join("\n");
  });

  return [
    `# ${session.title}`,
    "",
    metadataLines.join("\n"),
    "",
    "---",
    "",
    ...messageSections,
    "",
  ].join("\n");
}

export function downloadMessageMarkdown(
  session: SessionSummary,
  messages: Message[],
  messageId: string
) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${sanitizeFilename(session.title)}-turn-${date}.md`;
  downloadTextFile(
    filename,
    buildMessageExportMarkdown(session, messages, messageId),
    "text/markdown;charset=utf-8"
  );
}
