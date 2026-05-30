import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Copy,
  CopyCheck,
  Download,
  GitBranchPlus,
  Loader2,
  Search,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputForm } from "@/components/InputForm";
import type { ModelOption } from "@/types";
import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
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
import { getMessageElementId } from "@/lib/sessions";
import { cn } from "@/lib/utils";

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
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkFriendly]} components={humanMdComponents}>{messageText}</ReactMarkdown>
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
  handleShare: (messageId: string) => void;
  handleExport: (messageId: string) => void;
  handleBranch: (messageId: string) => void;
  copiedMessageId: string | null;
  feedbackMessageAction: MessageActionFeedback | null;
}

type MessageActionFeedback = {
  messageId: string;
  action: "share" | "export";
};

// AiMessageBubble Component
const AiMessageBubble: React.FC<AiMessageBubbleProps> = ({
  message,
  historicalActivity,
  liveActivity,
  isLastMessage,
  isOverallLoading,
  mdComponents,
  handleCopy,
  handleShare,
  handleExport,
  handleBranch,
  copiedMessageId,
  feedbackMessageAction,
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
  const messageId = message.id;
  const hasText = rawMessageText.length > 0;
  const activeFeedbackAction =
    feedbackMessageAction && feedbackMessageAction.messageId === messageId
      ? feedbackMessageAction.action
      : null;
  const isShareDone = activeFeedbackAction === "share";
  const isExportDone = activeFeedbackAction === "export";
  const isBranchDisabled = !messageId || (isLastMessage && isOverallLoading);
  const actionButtonClass =
    "h-8 w-8 cursor-pointer rounded-full border border-slate-200 bg-white p-0 text-slate-500 shadow-none hover:bg-slate-50 hover:text-slate-800";

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
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkFriendly]} components={mdComponents}>{processedText}</ReactMarkdown>
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

      <div className={cn("mt-3 flex justify-end gap-1", !hasText && "hidden")}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={actionButtonClass}
          disabled={!messageId}
          onClick={() => messageId && handleCopy(rawMessageText, messageId)}
          aria-label={copiedMessageId === messageId ? "Copied" : "Copy answer"}
          title={copiedMessageId === messageId ? "Copied" : "Copy answer"}
        >
          {copiedMessageId === messageId ? (
            <CopyCheck className="h-4 w-4 text-teal-700" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={actionButtonClass}
          disabled={!messageId}
          onClick={() => messageId && handleShare(messageId)}
          aria-label={isShareDone ? "Link copied" : "Share answer"}
          title={isShareDone ? "Link copied" : "Share answer"}
        >
          {isShareDone ? (
            <CopyCheck className="h-4 w-4 text-teal-700" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={actionButtonClass}
          disabled={!messageId}
          onClick={() => messageId && handleExport(messageId)}
          aria-label={isExportDone ? "Downloaded" : "Download answer"}
          title={isExportDone ? "Downloaded" : "Download answer"}
        >
          {isExportDone ? (
            <CopyCheck className="h-4 w-4 text-teal-700" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={actionButtonClass}
          disabled={isBranchDisabled}
          onClick={() => messageId && handleBranch(messageId)}
          aria-label="Branch from here"
          title="Branch from here"
        >
          <GitBranchPlus className="h-4 w-4" />
        </Button>
      </div>
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
  highlightedMessageId?: string | null;
  onBranchMessage: (messageId: string) => Promise<void>;
  onShareMessage: (messageId: string) => Promise<void>;
  onExportMessage: (messageId: string) => Promise<void>;
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
  highlightedMessageId,
  onBranchMessage,
  onShareMessage,
  onExportMessage,
}: ChatMessagesViewProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [feedbackMessageAction, setFeedbackMessageAction] =
    useState<MessageActionFeedback | null>(null);
  const visibleMessages = messages.filter(
    (message) => !isInternalQueryMessage(message)
  );

  const showMessageFeedback = (messageId: string, action: "share" | "export") => {
    setFeedbackMessageAction({ messageId, action });
    window.setTimeout(() => {
      setFeedbackMessageAction((current) =>
        current?.messageId === messageId && current.action === action
          ? null
          : current
      );
    }, 1800);
  };

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleShare = async (messageId: string) => {
    await onShareMessage(messageId);
    showMessageFeedback(messageId, "share");
  };

  const handleExport = async (messageId: string) => {
    await onExportMessage(messageId);
    showMessageFeedback(messageId, "export");
  };

  const handleBranch = async (messageId: string) => {
    await onBranchMessage(messageId);
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="mx-auto max-w-5xl space-y-4 px-4 pb-6 pt-10 md:px-6 md:pt-14">
          {visibleMessages.map((message, index) => {
            const isLast = index === visibleMessages.length - 1;
            const messageElementId = message.id
              ? getMessageElementId(message.id)
              : undefined;
            return (
              <div
                key={message.id || `msg-${index}`}
                id={messageElementId}
                className={cn(
                  "space-y-3 scroll-mt-6 rounded-3xl transition-shadow",
                  highlightedMessageId === message.id &&
                    "ring-2 ring-teal-300 ring-offset-4 ring-offset-slate-50"
                )}
              >
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
                      handleShare={handleShare}
                      handleExport={handleExport}
                      handleBranch={handleBranch}
                      copiedMessageId={copiedMessageId}
                      feedbackMessageAction={feedbackMessageAction}
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
