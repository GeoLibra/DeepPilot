import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Copy, CopyCheck, Search } from "lucide-react";
import { InputForm, ModelOption } from "@/components/InputForm";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  AnswerVisualBlocks,
  getVisualBlocks,
} from "@/components/AnswerVisualBlocks";
import {
  ActivityTimeline,
  ProcessedEvent,
} from "@/components/ActivityTimeline"; // Assuming ActivityTimeline is in the same dir or adjust path

// Markdown components (from former ReportView.tsx)
const mdComponents: Components = {
  h1: ({ className, children, ...props }) => (
    <h1 className={cn("text-2xl font-bold mt-4 mb-2", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2 className={cn("text-xl font-bold mt-3 mb-2", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3 className={cn("text-lg font-bold mt-3 mb-1", className)} {...props}>
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }) => (
    <p className={cn("mb-4 leading-7 text-slate-700", className)} {...props}>
      {children}
    </p>
  ),
  a: ({ className, children, href, ...props }) => (
    <Badge className="mx-0.5 max-w-full rounded-full border-teal-200 bg-teal-50 px-2 py-0.5 text-xs text-teal-800 hover:bg-teal-100">
      <a
        className={cn("break-words text-xs text-teal-800 hover:text-teal-900", className)}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    </Badge>
  ),
  ul: ({ className, children, ...props }) => (
    <ul className={cn("mb-4 list-disc pl-6 text-slate-700", className)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }) => (
    <ol className={cn("mb-4 list-decimal pl-6 text-slate-700", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }) => (
    <li className={cn("mb-1.5 pl-1", className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ className, children, ...props }) => (
    <blockquote
      className={cn(
        "border-l-4 border-slate-300 pl-4 italic my-3 text-sm text-slate-600",
        className
      )}
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) => (
    <code
      className={cn(
        "rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-teal-800",
        className
      )}
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ className, children, ...props }) => (
    <pre
      className={cn(
        "my-4 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700",
        className
      )}
      {...props}
    >
      {children}
    </pre>
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("border-slate-200 my-4", className)} {...props} />
  ),
  table: ({ className, children, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table className={cn("border-collapse w-full", className)} {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ className, children, ...props }) => (
    <th
      className={cn(
        "border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-900",
        className
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }) => (
    <td
      className={cn("border border-slate-200 px-3 py-2 text-slate-700", className)}
      {...props}
    >
      {children}
    </td>
  ),
};

// Props for HumanMessageBubble
interface HumanMessageBubbleProps {
  message: Message;
  mdComponents: typeof mdComponents;
}

// HumanMessageBubble Component
const HumanMessageBubble: React.FC<HumanMessageBubbleProps> = ({
  message,
  mdComponents,
}) => {
  const messageText = getMessageText(message);

  return (
    <div className="max-w-[100%] rounded-2xl rounded-br-md border border-teal-700 bg-teal-700 px-4 py-3 text-white shadow-sm sm:max-w-[90%] [&_*]:text-white [&_p:last-child]:mb-0">
      <ReactMarkdown components={mdComponents}>{messageText}</ReactMarkdown>
    </div>
  );
};

function stringifyContentPart(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringifyContentPart).join("");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    if (Array.isArray(record.content)) return record.content.map(stringifyContentPart).join("");
  }
  return JSON.stringify(value);
}

function normalizePythonTextParts(text: string) {
  if (!text.trim().startsWith("[{") || !text.includes("'text'")) return text;

  const matches = [...text.matchAll(/['"]text['"]:\s*(['"])([\s\S]*?)\1\s*(?:, ['"]annotations['"]|, ['"]type['"]|})/g)];
  if (matches.length === 0) return text;
  return matches.map((match) => match[2]).join("");
}

function getMessageText(message: Message) {
  return normalizePythonTextParts(stringifyContentPart(message.content));
}

function isInternalQueryMessage(message: Message) {
  if (message.type === "human") return false;

  let text = getMessageText(message).trim();
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

// Props for AiMessageBubble
interface AiMessageBubbleProps {
  message: Message;
  historicalActivity: ProcessedEvent[] | undefined;
  liveActivity: ProcessedEvent[] | undefined;
  isLastMessage: boolean;
  isOverallLoading: boolean;
  mdComponents: typeof mdComponents;
  handleCopy: (text: string, messageId: string) => void;
  copiedMessageId: string | null;
}

// AiMessageBubble Component
const AiMessageBubble: React.FC<AiMessageBubbleProps> = ({
  message,
  historicalActivity,
  liveActivity,
  isLastMessage,
  isOverallLoading,
  mdComponents,
  handleCopy,
  copiedMessageId,
}) => {
  // Determine which activity events to show and if it's for a live loading message
  const activityForThisBubble =
    isLastMessage && isOverallLoading ? liveActivity : historicalActivity;
  const isLiveActivityForThisBubble = isLastMessage && isOverallLoading;
  const messageText = getMessageText(message);
  const showVisualBlocks =
    messageText.length > 0 && !(isLastMessage && isOverallLoading);
  const visualBlocks = getVisualBlocks(
    (message as { additional_kwargs?: { visual_blocks?: unknown } })
      .additional_kwargs?.visual_blocks
  );

  return (
    <div className="relative flex min-w-0 flex-col break-words rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      {activityForThisBubble && activityForThisBubble.length > 0 && (
        <div className="mb-4 border-b border-slate-200 pb-4 text-xs">
          <ActivityTimeline
            processedEvents={activityForThisBubble}
            isLoading={isLiveActivityForThisBubble}
          />
        </div>
      )}
      {showVisualBlocks && <AnswerVisualBlocks blocks={visualBlocks} />}
      <div className="max-w-none [overflow-wrap:anywhere]">
        <ReactMarkdown components={mdComponents}>{messageText}</ReactMarkdown>
      </div>
      <Button
        variant="default"
        className={`mt-2 h-9 cursor-pointer self-end rounded-full border border-slate-200 bg-white px-3 text-slate-600 shadow-none hover:bg-slate-50 ${
          messageText.length > 0 ? "visible" : "hidden"
        }`}
        onClick={() => handleCopy(messageText, message.id!)}
      >
        {copiedMessageId === message.id ? "Copied" : "Copy"}
        {copiedMessageId === message.id ? <CopyCheck /> : <Copy />}
      </Button>
    </div>
  );
};

interface ChatMessagesViewProps {
  messages: Message[];
  isLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (inputValue: string, effort: string, model: string) => void;
  onCancel: () => void;
  liveActivityEvents: ProcessedEvent[];
  historicalActivities: Record<string, ProcessedEvent[]>;
  modelOptions: ModelOption[];
  error?: string | null;
}

export function ChatMessagesView({
  messages,
  isLoading,
  scrollAreaRef,
  onSubmit,
  onCancel,
  liveActivityEvents,
  historicalActivities,
  modelOptions,
  error,
}: ChatMessagesViewProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const visibleMessages = messages.filter(
    (message) => !isInternalQueryMessage(message)
  );

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };
  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="mx-auto max-w-5xl space-y-4 px-4 pb-6 pt-10 md:px-6 md:pt-14">
          {visibleMessages.map((message, index) => {
            const isLast = index === visibleMessages.length - 1;
            return (
              <div key={message.id || `msg-${index}`} className="space-y-3">
                <div className={`flex items-start gap-3 ${message.type === "human" ? "justify-end" : ""}`}>
                  {message.type === "human" ? (
                    <HumanMessageBubble
                      message={message}
                      mdComponents={mdComponents}
                    />
                  ) : (
                    <AiMessageBubble
                      message={message}
                      historicalActivity={historicalActivities[message.id!]}
                      liveActivity={liveActivityEvents} // Pass global live events
                      isLastMessage={isLast}
                      isOverallLoading={isLoading} // Pass global loading state
                      mdComponents={mdComponents}
                      handleCopy={handleCopy}
                      copiedMessageId={copiedMessageId}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {isLoading &&
            (visibleMessages.length === 0 ||
              visibleMessages[visibleMessages.length - 1].type === "human") && (
              <div className="mt-3 flex items-start gap-3">
                <div className="group relative min-h-[64px] w-full max-w-[92%] rounded-2xl border border-slate-200 bg-white/90 p-4 text-slate-900 shadow-[0_18px_60px_rgba(15,23,42,0.08)] md:max-w-[82%]">
                  {liveActivityEvents.length > 0 ? (
                    <div className="text-xs">
                      <ActivityTimeline
                        processedEvents={liveActivityEvents}
                        isLoading={true}
                      />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-start gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                          <Search className="h-4 w-4 text-teal-700" />
                          Researching
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Preparing sources and drafting the answer.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      </ScrollArea>
      {error && (
        <div className="mx-auto w-full max-w-5xl px-4 py-2">
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}
      <InputForm
        onSubmit={onSubmit}
        isLoading={isLoading}
        onCancel={onCancel}
        hasHistory={messages.length > 0}
        modelOptions={modelOptions}
      />
    </div>
  );
}
