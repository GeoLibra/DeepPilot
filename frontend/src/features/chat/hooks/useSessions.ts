import { useState, useEffect, useCallback, useRef } from "react";
import { Client, type Message } from "@langchain/langgraph-sdk";
import type { SessionSummary } from "@/types";
import { ACTIVE_THREAD_STORAGE_KEY, RECENT_SESSION_RESTORE_MS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/message-utils";
import {
  getSessionIdFromUrl,
  listSessions,
  setSessionIdInUrl,
  getSessionMessages,
} from "@/lib/sessions";

export function useSessions(client: Client<any>) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionMessages, setActiveSessionMessages] = useState<Message[]>([]);
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false);
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    return getSessionIdFromUrl() || window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
  });
  
  const suppressRecentRestoreRef = useRef(false);

  const refreshSessions = useCallback(() => {
    setSessionsRefreshKey((value) => value + 1);
  }, []);

  const setPersistedActiveThreadId = useCallback((threadId: string | null) => {
    setActiveThreadId(threadId);
    setSessionIdInUrl(threadId);
    if (threadId) {
      window.localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, threadId);
    } else {
      window.localStorage.removeItem(ACTIVE_THREAD_STORAGE_KEY);
    }
  }, []);

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

  return {
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
  };
}
