import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, CopyCheck, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputForm } from "@/components/InputForm";
import type { ModelOption } from "@/types";
import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnswerVisualBlocks } from "@/components/AnswerVisualBlocks";
import {
  ActivityTimeline,
  ProcessedEvent,
} from "@/components/ActivityTimeline"; // Assuming ActivityTimeline is in the same dir or adjust path

import { mdComponents, humanMdComponents } from "./markdown-components";
import {
  processMessageCitations,
  getCleanMessageText,
  isInternalQueryMessage,
  getVisualBlocks,
} from "@/lib/message-utils";

// Props for HumanMessageBubble
interface HumanMessageBubbleProps {
  message: Message;
}

// HumanMessageBubble Component
const HumanMessageBubble: React.FC<HumanMessageBubbleProps> = ({
  message,
}) => {
  const messageText = getCleanMessageText(message);

  return (
    <div className="max-w-[100%] rounded-2xl rounded-br-md border border-teal-700 bg-teal-700 px-4 py-3 text-white shadow-sm sm:max-w-[90%] [&_*]:text-white [&_p:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={humanMdComponents}>{messageText}</ReactMarkdown>
    </div>
  );
};

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
  const rawMessageText = getCleanMessageText(message);
  
  const { processedText, references } = useMemo(
    () => processMessageCitations(rawMessageText),
    [rawMessageText]
  );

  const showVisualBlocks =
    rawMessageText.length > 0 && !(isLastMessage && isOverallLoading);
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
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{processedText}</ReactMarkdown>
      </div>
      
      {references.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2">
            {references.map((ref) => (
              <a
                key={ref.id}
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                title={ref.label}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors no-underline"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[8px] font-bold text-teal-800">
                  {ref.id}
                </span>
                <span className="truncate max-w-[200px]">{ref.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`mt-2 h-8 w-8 cursor-pointer self-end rounded-full border border-slate-200 bg-white p-0 text-slate-500 shadow-none hover:bg-slate-50 hover:text-slate-800 ${
          rawMessageText.length > 0 ? "visible" : "hidden"
        }`}
        onClick={() => handleCopy(rawMessageText, message.id!)}
        aria-label={copiedMessageId === message.id ? "Copied" : "Copy answer"}
        title={copiedMessageId === message.id ? "Copied" : "Copy answer"}
      >
        {copiedMessageId === message.id ? (
          <CopyCheck className="h-4 w-4 text-teal-700" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
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
  onNewSession: () => void;
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
  onNewSession,
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
        onNewSession={onNewSession}
        hasHistory={messages.length > 0}
        modelOptions={modelOptions}
      />
    </div>
  );
}
