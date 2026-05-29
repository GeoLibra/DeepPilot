import { useStream } from "@langchain/langgraph-sdk/react";
import { Client, type Message } from "@langchain/langgraph-sdk";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ProcessedEvent } from "@/components/ActivityTimeline";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";
import { SessionSidebar } from "@/components/SessionSidebar";
import type { ModelOption, StreamUpdateEvent } from "@/types";
import { FALLBACK_MODEL_OPTIONS, ACTIVE_THREAD_STORAGE_KEY, RECENT_SESSION_RESTORE_MS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/message-utils";
import {
  listSessions,
  renameSession,
  updateSessionAfterRun,
  getSessionMessages,
} from "@/lib/sessions";
import type {
  AgentState,
  LastRunDetails,
  SessionSummary,
} from "@/types";

export default function App() {
  const apiUrl = import.meta.env.DEV
    ? "http://localhost:2026"
    : "http://localhost:8123";
  const client = useMemo(() => new Client<AgentState>({ apiUrl }), [apiUrl]);
  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<
    ProcessedEvent[]
  >([]);
  const [historicalActivities, setHistoricalActivities] = useState<
    Record<string, ProcessedEvent[]>
  >({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);
  const lastSubmittedRef = useRef<LastRunDetails | null>(null);
  const suppressRecentRestoreRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionMessages, setActiveSessionMessages] = useState<Message[]>(
    []
  );
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false);
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    return window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
  });
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(
    FALLBACK_MODEL_OPTIONS
  );

  const refreshSessions = useCallback(() => {
    setSessionsRefreshKey((value) => value + 1);
  }, []);

  const setPersistedActiveThreadId = useCallback((threadId: string | null) => {
    setActiveThreadId(threadId);
    if (threadId) {
      window.localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, threadId);
    } else {
      window.localStorage.removeItem(ACTIVE_THREAD_STORAGE_KEY);
    }
  }, []);

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
          setActiveSessionMessages(
            Array.isArray(state.values.messages) ? state.values.messages : []
          );
          refreshSessions();
        })
        .catch((metadataError) => {
          setSessionError(getErrorMessage(metadataError));
        });
    },
  });

  const displayMessages =
    thread.isLoading || activeSessionMessages.length === 0
      ? thread.messages
      : activeSessionMessages;

  useEffect(() => {
    let cancelled = false;
    setIsRefreshingSessions(true);
    setSessionError(null);

    listSessions(client)
      .then((nextSessions) => {
        if (cancelled) return;
        setSessions(nextSessions);
        if (!activeThreadId && !suppressRecentRestoreRef.current) {
          const recentSession = nextSessions[0];
          const updatedAt = recentSession
            ? new Date(recentSession.updatedAt).getTime()
            : Number.NaN;
          if (
            recentSession &&
            Number.isFinite(updatedAt) &&
            Date.now() - updatedAt <= RECENT_SESSION_RESTORE_MS
          ) {
            setPersistedActiveThreadId(recentSession.id);
          }
        }
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setSessionError(getErrorMessage(fetchError));
      })
      .finally(() => {
        if (!cancelled) {
          setIsRefreshingSessions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, client, sessionsRefreshKey, setPersistedActiveThreadId]);

  useEffect(() => {
    let cancelled = false;

    if (!activeThreadId) {
      setActiveSessionMessages([]);
      return () => {
        cancelled = true;
      };
    }

    getSessionMessages(client, activeThreadId)
      .then((messages) => {
        if (!cancelled) {
          setActiveSessionMessages(messages);
        }
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setActiveSessionMessages([]);
        setSessionError(getErrorMessage(fetchError));
      });

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, client, sessionsRefreshKey]);

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
  }, [displayMessages]);

  useEffect(() => {
    if (
      hasFinalizeEventOccurredRef.current &&
      !thread.isLoading &&
      displayMessages.length > 0
    ) {
      const lastMessage = displayMessages[displayMessages.length - 1];
      if (lastMessage && lastMessage.type === "ai" && lastMessage.id) {
        setHistoricalActivities((prev) => ({
          ...prev,
          [lastMessage.id!]: [...processedEventsTimeline],
        }));
      }
      hasFinalizeEventOccurredRef.current = false;
    }
  }, [displayMessages, thread.isLoading, processedEventsTimeline]);

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
        ...(displayMessages || []),
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
    [displayMessages, thread]
  );

  const handleCancel = useCallback(() => {
    thread.stop();
  }, [thread]);

  const handleNewSession = useCallback(() => {
    if (thread.isLoading) {
      thread.stop();
    }
    setError(null);
    setProcessedEventsTimeline([]);
    setHistoricalActivities({});
    setActiveSessionMessages([]);
    hasFinalizeEventOccurredRef.current = false;
    lastSubmittedRef.current = null;
    suppressRecentRestoreRef.current = true;
    setPersistedActiveThreadId(null);
  }, [setPersistedActiveThreadId, thread]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeThreadId) return;
      if (thread.isLoading) {
        thread.stop();
      }
      setError(null);
      setProcessedEventsTimeline([]);
      setHistoricalActivities({});
      setActiveSessionMessages([]);
      hasFinalizeEventOccurredRef.current = false;
      lastSubmittedRef.current = null;
      suppressRecentRestoreRef.current = true;
      setPersistedActiveThreadId(sessionId);
    },
    [activeThreadId, setPersistedActiveThreadId, thread]
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      setSessionError(null);
      await renameSession(client, sessionId, title);
      refreshSessions();
    },
    [client, refreshSessions]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      setSessionError(null);
      if (sessionId === activeThreadId && thread.isLoading) {
        thread.stop();
      }

      await client.threads.delete(sessionId);

      if (sessionId === activeThreadId) {
        const nextSession = sessions.find((session) => session.id !== sessionId);
        setPersistedActiveThreadId(nextSession?.id ?? null);
        setProcessedEventsTimeline([]);
        setHistoricalActivities({});
        setActiveSessionMessages([]);
        lastSubmittedRef.current = null;
        suppressRecentRestoreRef.current = true;
      }

      refreshSessions();
    },
    [
      activeThreadId,
      client,
      refreshSessions,
      sessions,
      setPersistedActiveThreadId,
      thread,
    ]
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef6f4_48%,#f8fafc_100%)] font-sans text-slate-900 antialiased md:flex-row">
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeThreadId}
        isLoading={thread.isLoading}
        isRefreshing={isRefreshingSessions}
        error={sessionError}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        onRefresh={refreshSessions}
      />
      <main className="min-h-0 flex-1">
        <div className="mx-auto h-full w-full max-w-6xl">
          {displayMessages.length === 0 ? (
            <WelcomeScreen
              handleSubmit={handleSubmit}
              isLoading={thread.isLoading}
              onCancel={handleCancel}
              modelOptions={modelOptions}
              error={error}
            />
          ) : (
            <ChatMessagesView
              messages={displayMessages}
              isLoading={thread.isLoading}
              scrollAreaRef={scrollAreaRef}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              onNewSession={handleNewSession}
              liveActivityEvents={processedEventsTimeline}
              historicalActivities={historicalActivities}
              modelOptions={modelOptions}
              error={error}
            />
          )}
        </div>
      </main>
    </div>
  );
}
