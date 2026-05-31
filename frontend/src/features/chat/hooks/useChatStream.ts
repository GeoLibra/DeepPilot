import { useState, useRef, useCallback } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { Client, type Message } from "@langchain/langgraph-sdk";
import type { AgentState, StreamUpdateEvent, LastRunDetails } from "@/types";
import type { ProcessedEvent } from "@/features/chat/types";
import { getErrorMessage } from "@/lib/message-utils";
import { updateSessionAfterRun } from "@/lib/sessions";

export function useChatStream(
  client: Client<AgentState>,
  activeThreadId: string | null,
  setPersistedActiveThreadId: (id: string | null) => void,
  refreshSessions: () => void,
  setActiveSessionMessages: (messages: Message[]) => void,
  setSessionError: (err: string | null) => void
) {
  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<ProcessedEvent[]>([]);
  const [historicalActivities, setHistoricalActivities] = useState<Record<string, ProcessedEvent[]>>({});
  const [error, setError] = useState<string | null>(null);
  
  const hasFinalizeEventOccurredRef = useRef(false);
  const lastSubmittedRef = useRef<LastRunDetails | null>(null);

  const thread = useStream<AgentState>({
    client,
    assistantId: "agent",
    messagesKey: "messages",
    threadId: activeThreadId,
    onThreadId: (threadId: string) => {
      setPersistedActiveThreadId(threadId);
      refreshSessions();
    },
    onUpdateEvent: (event: StreamUpdateEvent) => {
      let processedEvent: ProcessedEvent | null = null;
      if (event.plan_research) {
        processedEvent = {
          phase: "planning",
          title: "Planning Research",
          data:
            event.plan_research.research_plan?.objective ||
            "Preparing the research plan.",
        };
      } else if (event.generate_query) {
        processedEvent = {
          phase: "queries",
          title: "Generating Search Queries",
          data: event.generate_query?.search_query?.join(", ") || "",
        };
      } else if (event.web_research) {
        const sources = event.web_research.sources_gathered || [];
        const numSources = sources.length;
        const uniqueLabels = [...new Set(sources.map((source) => source.label).filter(Boolean))];
        const exampleLabels = uniqueLabels.slice(0, 3).join(", ");
        processedEvent = {
          phase: "research",
          title: "Web Research",
          data: `Gathered ${numSources} sources. Related to: ${exampleLabels || "N/A"}.`,
        };
      } else if (event.reflection) {
        processedEvent = {
          phase: "reflection",
          title: "Reflection",
          data: "Analysing Web Research Results",
        };
      } else if (event.finalize_answer) {
        processedEvent = {
          phase: "finalize",
          title: "Finalizing Answer",
          data: "Composing and presenting the final answer.",
        };
      } else if (event.visualize_answer) {
        const blocks = event.visualize_answer.visual_blocks || [];
        processedEvent = {
          phase: "visuals",
          title: "Formatting Visuals",
          data: `Prepared ${blocks.length} visual block${blocks.length === 1 ? "" : "s"}.`,
        };
        hasFinalizeEventOccurredRef.current = true;
      }
      if (processedEvent) {
        setProcessedEventsTimeline((prevEvents) => [...prevEvents, processedEvent!]);
      }
    },
    onError: (err: unknown) => {
      setError(getErrorMessage(err));
    },
    onFinish: (state) => {
      const finishedThreadId = state.checkpoint.thread_id;
      if (!finishedThreadId) return;

      void updateSessionAfterRun(
        client,
        finishedThreadId,
        Array.isArray(state.values.messages) ? state.values.messages : [],
        lastSubmittedRef.current
      )
        .then(() => {
          setActiveSessionMessages(Array.isArray(state.values.messages) ? state.values.messages : []);
          refreshSessions();
        })
        .catch((metadataError) => {
          setSessionError(getErrorMessage(metadataError));
        });
    },
  });

  const handleSubmit = useCallback(
    (submittedInputValue: string, effort: string, model: string, currentMessages: Message[]) => {
      if (!submittedInputValue.trim()) return;
      setError(null);
      setProcessedEventsTimeline([]);
      hasFinalizeEventOccurredRef.current = false;

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
        ...(currentMessages || []),
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
      lastSubmittedRef.current = {
        input: submittedInputValue,
        effort,
        model,
      };
    },
    [thread]
  );

  const handleCancel = useCallback(() => {
    thread.stop();
  }, [thread]);

  const handleApproveResearchPlan = useCallback(
    (planMarkdown: string) => {
      thread.submit(null, {
        command: {
          resume: {
            action: "approve",
            plan_markdown: planMarkdown,
          },
        },
      });
    },
    [thread]
  );

  return {
    thread,
    error,
    setError,
    processedEventsTimeline,
    setProcessedEventsTimeline,
    historicalActivities,
    setHistoricalActivities,
    hasFinalizeEventOccurredRef,
    lastSubmittedRef,
    handleSubmit,
    handleCancel,
    handleApproveResearchPlan,
  };
}
