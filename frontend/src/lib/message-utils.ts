import type { Message } from "@langchain/langgraph-sdk";

export function stringifyContentPart(value: unknown): string {
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

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizePythonTextParts(text: string) {
  if (!text.trim().startsWith("[{") || !text.includes("'text'")) return text;

  const matches = [
    ...text.matchAll(
      /['"]text['"]:\s*(['"])([\s\S]*?)\1\s*(?:, ['"]annotations['"]|, ['"]type['"]|})/g
    ),
  ];
  if (matches.length === 0) return text;
  return matches.map((match) => match[2]).join("");
}

export function getRawMessageText(message: Message) {
  return stringifyContentPart(message.content);
}

export function getCleanMessageText(message: Message) {
  return normalizePythonTextParts(getRawMessageText(message));
}

export function getPreviewMessageText(message: Message) {
  return normalizeWhitespace(getRawMessageText(message));
}

export function isInternalQueryMessage(message: Message) {
  if (message.type === "human") return false;

  let text = getCleanMessageText(message).trim();
  text = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!text.startsWith("{")) return false;
  if (/^\{\s*["']query["']\s*:/.test(text)) return true;
  if (text.includes('"query"') && text.includes("[") && !text.includes("Final answer:")) {
    return true;
  }

  try {
    const parsed = JSON.parse(text);
    return (
      Array.isArray(parsed.query) &&
      parsed.query.every((query: unknown) => typeof query === "string") &&
      (parsed.rationale === undefined || typeof parsed.rationale === "string")
    );
  } catch {
    return false;
  }
}

export function processMessageCitations(text: string) {
  const references: { id: number; label: string; url: string }[] = [];
  const urlToId = new Map<string, number>();

  function getOrCreateRef(url: string, label: string): number {
    let id = urlToId.get(url);
    if (id === undefined) {
      id = references.length + 1;
      urlToId.set(url, id);
      references.push({ id, label, url });
    }
    return id;
  }

  // Step 1: Convert standard markdown links [label](url) to numbered citations
  let processedText = text.replace(
    /(!?)\[([^\]]+)\]\(([^)]+)\)/g,
    (match, isImage, label, url) => {
      if (isImage) return match;
      const id = getOrCreateRef(url, label);
      return `[${id}](${url})`;
    }
  );

  // Step 2: Convert bare URLs that are not already inside markdown links
  processedText = processedText.replace(
    /(?<!\]\()(?<!\()(https?:\/\/[^\s)\]]+)/g,
    (bareUrl) => {
      const id = getOrCreateRef(bareUrl, bareUrl);
      return `[${id}](${bareUrl})`;
    }
  );

  return { processedText, references };
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : JSON.stringify(message);
  }
  return String(error);
}

export function getVisualBlocks(value: unknown): import("@/types").VisualBlock[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isVisualBlock)
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));
}

function isVisualBlock(value: unknown): value is import("@/types").VisualBlock {
  if (!value || typeof value !== "object") return false;

  const block = value as Record<string, unknown>;
  return (
    (block.type === "t8" || block.type === "infographic") &&
    typeof block.title === "string" &&
    typeof block.syntax === "string" &&
    block.syntax.trim().length > 0
  );
}
