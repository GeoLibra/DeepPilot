import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import { useState, useEffect, useRef, useCallback } from "react";
import { ProcessedEvent } from "@/components/ActivityTimeline";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";
import { Button } from "@/components/ui/button";
import type { ModelOption } from "@/components/InputForm";

const FALLBACK_MODEL_OPTIONS: ModelOption[] = [
  {
    name: "deepseek-v4-pro",
    display_name: "DeepSeek V4 Pro (NVIDIA)",
  },
  {
    name: "kimi-k2.6",
    display_name: "Kimi K2.6 (NVIDIA)",
    supports_thinking: true,
    supports_vision: true,
  },
  {
    name: "deepseek-v4-flash",
    display_name: "DeepSeek V4 Flash (NVIDIA)",
    supports_thinking: true,
  },
  {
    name: "glm-5.1",
    display_name: "GLM 5.1 (NVIDIA)",
    supports_thinking: true,
  },
  {
    name: "minimax-m2.7",
    display_name: "Minimax M2.7 (NVIDIA)",
  },
  {
    name: "gpt-5.5",
    display_name: "GPT-5.5 (OpenAI)",
  },
];

type SourceEvent = {
  label?: string;
};

type StreamUpdateEvent = {
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : JSON.stringify(message);
  }
  return String(error);
}

export default function App() {
  const apiUrl = import.meta.env.DEV
    ? "http://localhost:2026"
    : "http://localhost:8123";
  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<
    ProcessedEvent[]
  >([]);
  const [historicalActivities, setHistoricalActivities] = useState<
    Record<string, ProcessedEvent[]>
  >({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(
    FALLBACK_MODEL_OPTIONS
  );
  const thread = useStream<{
    messages: Message[];
    initial_search_query_count: number;
    max_research_loops: number;
    reasoning_model: string;
  }>({
    apiUrl,
    assistantId: "agent",
    messagesKey: "messages",
    onUpdateEvent: (event: StreamUpdateEvent) => {
      let processedEvent: ProcessedEvent | null = null;
      if (event.generate_query) {
        processedEvent = {
          title: "Generating Search Queries",
          data: event.generate_query?.search_query?.join(", ") || "",
        };
      } else if (event.web_research) {
        const sources = event.web_research.sources_gathered || [];
        const numSources = sources.length;
        const uniqueLabels = [
          ...new Set(sources.map((source) => source.label).filter(Boolean)),
        ];
        const exampleLabels = uniqueLabels.slice(0, 3).join(", ");
        processedEvent = {
          title: "Web Research",
          data: `Gathered ${numSources} sources. Related to: ${
            exampleLabels || "N/A"
          }.`,
        };
      } else if (event.reflection) {
        processedEvent = {
          title: "Reflection",
          data: "Analysing Web Research Results",
        };
      } else if (event.finalize_answer) {
        processedEvent = {
          title: "Finalizing Answer",
          data: "Composing and presenting the final answer.",
        };
      } else if (event.visualize_answer) {
        const blocks = event.visualize_answer.visual_blocks || [];
        processedEvent = {
          title: "Formatting Visuals",
          data: `Prepared ${blocks.length} visual block${
            blocks.length === 1 ? "" : "s"
          }.`,
        };
        hasFinalizeEventOccurredRef.current = true;
      }
      if (processedEvent) {
        setProcessedEventsTimeline((prevEvents) => [
          ...prevEvents,
          processedEvent!,
        ]);
      }
    },
    onError: (error: unknown) => {
      setError(getErrorMessage(error));
    },
  });

  useEffect(() => {
    let cancelled = false;

    fetch("/models")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load model list: ${response.status}`);
        }
        return response.json();
      })
      .then((data: { models?: ModelOption[] }) => {
        if (cancelled || !Array.isArray(data.models) || data.models.length === 0) {
          return;
        }
        setModelOptions(data.models);
      })
      .catch((fetchError) => {
        console.warn("Using fallback model list:", fetchError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [thread.messages]);

  useEffect(() => {
    if (
      hasFinalizeEventOccurredRef.current &&
      !thread.isLoading &&
      thread.messages.length > 0
    ) {
      const lastMessage = thread.messages[thread.messages.length - 1];
      if (lastMessage && lastMessage.type === "ai" && lastMessage.id) {
        setHistoricalActivities((prev) => ({
          ...prev,
          [lastMessage.id!]: [...processedEventsTimeline],
        }));
      }
      hasFinalizeEventOccurredRef.current = false;
    }
  }, [thread.messages, thread.isLoading, processedEventsTimeline]);

  const handleSubmit = useCallback(
    (submittedInputValue: string, effort: string, model: string) => {
      if (!submittedInputValue.trim()) return;
      setError(null);
      setProcessedEventsTimeline([]);
      hasFinalizeEventOccurredRef.current = false;

      // convert effort to, initial_search_query_count and max_research_loops
      // low means max 1 loop and 1 query
      // medium means max 3 loops and 3 queries
      // high means max 10 loops and 5 queries
      let initial_search_query_count = 0;
      let max_research_loops = 0;
      switch (effort) {
        case "low":
          initial_search_query_count = 1;
          max_research_loops = 1;
          break;
        case "medium":
          initial_search_query_count = 3;
          max_research_loops = 3;
          break;
        case "high":
          initial_search_query_count = 5;
          max_research_loops = 10;
          break;
      }

      const newMessages: Message[] = [
        ...(thread.messages || []),
        {
          type: "human",
          content: submittedInputValue,
          id: Date.now().toString(),
        },
      ];
      thread.submit({
        messages: newMessages,
        initial_search_query_count: initial_search_query_count,
        max_research_loops: max_research_loops,
        reasoning_model: model,
      });
    },
    [thread]
  );

  const handleCancel = useCallback(() => {
    thread.stop();
    window.location.reload();
  }, [thread]);

  return (
    <div className="flex min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef6f4_48%,#f8fafc_100%)] font-sans text-slate-900 antialiased">
      <main className="mx-auto h-[100dvh] w-full max-w-6xl">
          {thread.messages.length === 0 ? (
            <WelcomeScreen
              handleSubmit={handleSubmit}
              isLoading={thread.isLoading}
              onCancel={handleCancel}
              modelOptions={modelOptions}
              error={error}
            />
          ) : (
            <ChatMessagesView
              messages={thread.messages}
              isLoading={thread.isLoading}
              scrollAreaRef={scrollAreaRef}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              liveActivityEvents={processedEventsTimeline}
              historicalActivities={historicalActivities}
              modelOptions={modelOptions}
              error={error}
            />
          )}
      </main>
    </div>
  );
}
