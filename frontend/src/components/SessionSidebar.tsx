import { useMemo, useState } from "react";
import {
  Check,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { filterSessions } from "@/lib/sessions";
import type { SessionSummary } from "@/types";

interface SessionSidebarProps {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error?: string | null;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onRefresh: () => void;
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  isLoading,
  isRefreshing,
  error,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onRefresh,
}: SessionSidebarProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const filteredSessions = useMemo(
    () => filterSessions(sessions, query),
    [query, sessions]
  );

  const startEditing = (session: SessionSummary) => {
    setEditingId(session.id);
    setDraftTitle(session.title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftTitle("");
  };

  const submitRename = async (event?: { preventDefault: () => void }) => {
    if (event) event.preventDefault();
    if (!editingId || !draftTitle.trim()) return;
    setPendingActionId(editingId);
    try {
      await onRenameSession(editingId, draftTitle.trim());
      cancelEditing();
    } finally {
      setPendingActionId(null);
    }
  };

  const deleteSession = async (sessionId: string) => {
    setPendingActionId(sessionId);
    try {
      await onDeleteSession(sessionId);
      if (editingId === sessionId) cancelEditing();
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <aside className="flex max-h-[42dvh] w-full shrink-0 flex-col border-b border-slate-200/80 bg-white/80 p-3 backdrop-blur md:h-[100dvh] md:max-h-none md:w-80 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessageSquareText className="h-4 w-4 text-teal-700" />
            Sessions
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {sessions.length} saved
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh sessions"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 rounded-lg bg-teal-700 text-white hover:bg-teal-800"
            onClick={onNewSession}
            title="New session"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions"
          className="h-9 rounded-xl border-slate-200 bg-white pl-9 text-sm shadow-none"
        />
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      <ScrollArea className="mt-3 min-h-0 flex-1">
        <div className="space-y-2 pr-2">
          {filteredSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-5 text-center text-xs text-slate-500">
              {query.trim() ? "No matching sessions" : "No sessions yet"}
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isBusy =
                session.status === "busy" || (isActive && isLoading);
              const isPending = pendingActionId === session.id;

              const isEditing = editingId === session.id;

              return (
                <div
                  key={session.id}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-2 transition-colors",
                    isActive || isEditing
                      ? "border-teal-200 bg-teal-50"
                      : "border-transparent bg-white/60 hover:border-slate-200 hover:bg-white"
                  )}
                >
                  <div className="flex w-full items-start gap-2 overflow-hidden">
                    <div
                      role="button"
                      tabIndex={0}
                      className="min-w-0 flex-1 overflow-hidden text-left outline-none cursor-pointer"
                      onClick={() => !isEditing && onSelectSession(session.id)}
                    >
                      {isEditing ? (
                        <form onSubmit={submitRename} className="flex min-w-0 items-center gap-2">
                          <Input
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                            className="h-7 w-full rounded-md border-teal-300 bg-white px-2 py-1 text-sm focus-visible:ring-1 focus-visible:ring-teal-500 shadow-none"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        </form>
                      ) : (
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-900">
                            {session.title}
                          </span>
                          {isBusy && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
                          )}
                        </div>
                      )}
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {session.preview}
                      </p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] text-slate-400">
                        <span>{formatSessionTime(session.updatedAt)}</span>
                        {session.model && (
                          <span className="truncate">{session.model}</span>
                        )}
                      </div>
                    </div>
                    <div className={cn(
                      "flex shrink-0 items-center gap-0.5 transition-opacity",
                      isEditing ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    )}>
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                            onClick={cancelEditing}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            className="h-7 w-7 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                            disabled={!draftTitle.trim() || isPending}
                            onClick={submitRename}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(session);
                            }}
                            disabled={isPending}
                            title="Rename session"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(session.id);
                            }}
                            disabled={isPending || isBusy}
                            title="Delete session"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
