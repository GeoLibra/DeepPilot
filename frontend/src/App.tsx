import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Client } from "@langchain/langgraph-sdk";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";
import { SessionSidebar } from "@/components/SessionSidebar";
import { getResearchPlanReviewInterrupt } from "@/lib/message-utils";
import {
  DEFAULT_MODEL_NAME,
  DEFAULT_RESEARCH_EFFORT,
} from "@/lib/constants";
import {
  branchSessionFromMessage,
  copyMessageShareUrl,
  downloadMessageMarkdown,
  getMessageElementId,
  getMessageIdFromUrl,
  renameSession,
} from "@/lib/sessions";
import type { AgentState } from "@/types";

import { useModels } from "@/features/chat/hooks/useModels";
import { useSessions } from "@/features/chat/hooks/useSessions";
import { useChatStream } from "@/features/chat/hooks/useChatStream";

export default function App() {
  const apiUrl = import.meta.env.DEV
    ? "http://localhost:2026"
    : "http://localhost:8123";
  const client = useMemo(() => new Client<AgentState>({ apiUrl }), [apiUrl]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const [targetMessageId, setTargetMessageId] = useState<string | null>(() =>
    getMessageIdFromUrl()
  );
  const hasScrolledToTargetMessageRef = useRef(false);



  const { modelOptions } = useModels();

  const {
    sessions,
    activeSessionMessages,
    setActiveSessionMessages,
    isRefreshingSessions,
    sessionError,
    setSessionError,
    activeThreadId,
    setPersistedActiveThreadId,
    refreshSessions,
    suppressRecentRestoreRef,
  } = useSessions(client);

  useEffect(() => {
    setTargetMessageId(null);
    hasScrolledToTargetMessageRef.current = false;
  }, [activeThreadId]);

  const {
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
  } = useChatStream(
    client,
    activeThreadId,
    setPersistedActiveThreadId,
    refreshSessions,
    setActiveSessionMessages,
    setSessionError
  );

  const displayMessages =
    thread.isLoading || activeSessionMessages.length === 0
      ? thread.messages
      : activeSessionMessages;
  const researchPlanInterrupt = getResearchPlanReviewInterrupt(
    thread.interrupt?.value
  );

  useEffect(() => {
    if (
      targetMessageId &&
      displayMessages.some((message) => message.id === targetMessageId)
    ) {
      return;
    }

    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [displayMessages, targetMessageId]);

  useEffect(() => {
    if (!targetMessageId || hasScrolledToTargetMessageRef.current) return;
    if (!displayMessages.some((message) => message.id === targetMessageId)) return;

    const messageElement = document.getElementById(
      getMessageElementId(targetMessageId)
    );
    if (!messageElement) return;

    messageElement.scrollIntoView({ block: "center", behavior: "smooth" });
    hasScrolledToTargetMessageRef.current = true;
  }, [displayMessages, targetMessageId]);

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
  }, [
    displayMessages,
    thread.isLoading,
    processedEventsTimeline,
    setHistoricalActivities,
    hasFinalizeEventOccurredRef,
  ]);

  const onChatSubmit = useCallback(
    (submittedInputValue: string, effort: string, model: string) => {
      handleSubmit(submittedInputValue, effort, model, displayMessages);
    },
    [handleSubmit, displayMessages]
  );

  const handleRegenerateMessage = useCallback(
    (messageId: string, revisedText: string) => {
      if (thread.isLoading) return;

      const messageIndex = displayMessages.findIndex(
        (message) => message.id === messageId
      );
      if (messageIndex < 0) return;

      const sourceSession = sessions.find(
        (session) => session.id === activeThreadId
      );
      const effort =
        sourceSession?.effort ??
        lastSubmittedRef.current?.effort ??
        DEFAULT_RESEARCH_EFFORT;
      const model =
        sourceSession?.model ??
        lastSubmittedRef.current?.model ??
        DEFAULT_MODEL_NAME;
      const messagesBeforeEditedTurn = displayMessages.slice(0, messageIndex);

      setTargetMessageId(null);
      setError(null);
      setHistoricalActivities({});
      handleSubmit(
        revisedText,
        effort,
        model,
        messagesBeforeEditedTurn
      );
    },
    [
      activeThreadId,
      displayMessages,
      handleSubmit,
      lastSubmittedRef,
      sessions,
      setError,
      setHistoricalActivities,
      thread.isLoading,
    ]
  );

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
  }, [
    thread,
    setError,
    setProcessedEventsTimeline,
    setHistoricalActivities,
    setActiveSessionMessages,
    hasFinalizeEventOccurredRef,
    lastSubmittedRef,
    suppressRecentRestoreRef,
    setPersistedActiveThreadId,
  ]);

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
    [
      activeThreadId,
      thread,
      setError,
      setProcessedEventsTimeline,
      setHistoricalActivities,
      setActiveSessionMessages,
      hasFinalizeEventOccurredRef,
      lastSubmittedRef,
      suppressRecentRestoreRef,
      setPersistedActiveThreadId,
    ]
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      setSessionError(null);
      await renameSession(client, sessionId, title);
      refreshSessions();
    },
    [client, refreshSessions, setSessionError]
  );

  const handleBranchMessage = useCallback(
    async (messageId: string) => {
      if (!activeThreadId) {
        throw new Error("No active session.");
      }

      setSessionError(null);
      if (thread.isLoading) {
        thread.stop();
      }

      const sourceSession = sessions.find(
        (session) => session.id === activeThreadId
      );
      const branch = await branchSessionFromMessage(
        client,
        activeThreadId,
        messageId,
        displayMessages,
        sourceSession
      );
      setProcessedEventsTimeline([]);
      setHistoricalActivities({});
      setActiveSessionMessages(branch.messages);
      hasFinalizeEventOccurredRef.current = false;
      lastSubmittedRef.current = null;
      suppressRecentRestoreRef.current = true;
      setPersistedActiveThreadId(branch.threadId);
      refreshSessions();
    },
    [
      activeThreadId,
      client,
      displayMessages,
      refreshSessions,
      sessions,
      setPersistedActiveThreadId,
      thread,
      setSessionError,
      setProcessedEventsTimeline,
      setHistoricalActivities,
      setActiveSessionMessages,
      hasFinalizeEventOccurredRef,
      lastSubmittedRef,
      suppressRecentRestoreRef,
    ]
  );

  const handleShareMessage = useCallback(
    async (messageId: string) => {
      if (!activeThreadId) {
        throw new Error("No active session.");
      }

      setSessionError(null);
      await copyMessageShareUrl(activeThreadId, messageId);
    },
    [activeThreadId, setSessionError]
  );

  const handleExportMessage = useCallback(
    async (messageId: string) => {
      if (!activeThreadId) {
        throw new Error("No active session.");
      }

      setSessionError(null);
      const session = sessions.find((item) => item.id === activeThreadId);
      if (!session) {
        throw new Error("Session not found.");
      }

      downloadMessageMarkdown(session, displayMessages, messageId);
    },
    [activeThreadId, displayMessages, sessions, setSessionError]
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
      setSessionError,
      setProcessedEventsTimeline,
      setHistoricalActivities,
      setActiveSessionMessages,
      lastSubmittedRef,
      suppressRecentRestoreRef,
    ]
  );

  return (
    <div className="aurora-shell flex h-[100dvh] flex-col overflow-hidden font-sans text-slate-950 antialiased md:flex-row [&_svg]:stroke-[1.8]">
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeThreadId}
        isLoading={thread.isLoading}
        isRefreshing={isRefreshingSessions}
        error={sessionError}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((value) => !value)}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        onRefresh={refreshSessions}
      />
      <main className="relative min-h-0 flex-1 bg-transparent">
        <div className="mx-auto h-full w-full max-w-[1240px]">
          {displayMessages.length === 0 && !researchPlanInterrupt ? (
            <WelcomeScreen
              handleSubmit={onChatSubmit}
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
              onSubmit={onChatSubmit}
              onCancel={handleCancel}
              onNewSession={handleNewSession}
              liveActivityEvents={processedEventsTimeline}
              historicalActivities={historicalActivities}
              modelOptions={modelOptions}
              error={error}
              highlightedMessageId={targetMessageId}
              researchPlanInterrupt={researchPlanInterrupt}
              onBranchMessage={handleBranchMessage}
              onShareMessage={handleShareMessage}
              onExportMessage={handleExportMessage}
              onRegenerateMessage={handleRegenerateMessage}
              onApproveResearchPlan={handleApproveResearchPlan}
            />
          )}
        </div>
      </main>
    </div>
  );
}
