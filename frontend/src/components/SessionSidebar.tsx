import { useMemo, useState } from "react";
import {
  Check,
  PanelLeftClose,
  PanelLeftOpen,
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
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
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
  isCollapsed,
  onToggleCollapsed,
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

  const actionButtonClass =
    "h-7 w-7 rounded-lg text-slate-500 transition-all hover:bg-white/55 hover:text-slate-900 hover:shadow-sm";
  const railButtonClass =
    "glass-control h-10 w-10 rounded-xl text-slate-600 transition-all hover:bg-white/60 hover:text-teal-800 hover:shadow-md";
  const newSessionButtonClass =
    "glass-control h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-50/85 via-teal-50/80 to-white/60 text-teal-900 shadow-[0_10px_26px_rgba(20,118,110,0.14)] transition-all hover:from-cyan-100/90 hover:via-teal-100/85 hover:text-teal-950 hover:shadow-[0_14px_30px_rgba(20,118,110,0.18)]";

  return (
    <aside
      className={cn(
        "glass-panel relative z-10 flex max-h-[44dvh] w-full shrink-0 flex-col p-3 transition-[width] duration-300 md:h-[100dvh] md:max-h-none",
        isCollapsed ? "md:w-[76px]" : "md:w-[336px]"
      )}
    >
      <div className={cn("hidden min-h-0 flex-1 flex-col items-center gap-2 md:flex", !isCollapsed && "md:hidden")}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={railButtonClass}
          onClick={onToggleCollapsed}
          title="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <div className="my-1 h-px w-8 bg-white/55 shadow-[0_1px_0_rgba(15,23,42,0.05)]" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(railButtonClass, "bg-gradient-to-br from-cyan-50/85 via-teal-50/80 to-white/60 text-teal-900")}
          onClick={onNewSession}
          title="New session"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(railButtonClass, isRefreshing && "text-teal-700")}
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh sessions"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
        <div className="glass-control mt-auto flex h-10 w-10 items-center justify-center rounded-xl text-xs font-semibold text-slate-600">
          {sessions.length}
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", isCollapsed && "md:hidden")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <span className="glass-control flex h-8 w-8 items-center justify-center rounded-xl text-teal-800">
              <MessageSquareText className="h-4 w-4" />
            </span>
            Sessions
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            {sessions.length} saved
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 rounded-lg text-slate-600 transition-all hover:bg-white/55 hover:text-slate-950 md:inline-flex"
            onClick={onToggleCollapsed}
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-slate-600 transition-all hover:bg-white/55 hover:text-slate-950"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh sessions"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button
            type="button"
            size="icon"
            className={newSessionButtonClass}
            onClick={onNewSession}
            title="New session"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-800/60" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions"
          className="glass-control h-10 rounded-xl border-0 bg-white/35 pl-9 text-sm text-slate-900 shadow-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-teal-600/25"
        />
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-100/70 bg-red-50/70 px-3 py-2 text-xs text-red-700 shadow-sm backdrop-blur">
          {error}
        </div>
      )}

      <ScrollArea className="mt-3 min-h-0 flex-1">
        <div className="space-y-2 pr-2">
          {filteredSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/60 bg-white/30 px-3 py-5 text-center text-xs text-slate-600 backdrop-blur">
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
                    "group relative overflow-hidden rounded-xl p-3 transition-all",
                    isActive || isEditing
                      ? "glass-card bg-white/60 shadow-[0_16px_42px_rgba(20,83,101,0.16)] ring-1 ring-teal-500/20"
                      : "bg-white/30 ring-1 ring-white/35 backdrop-blur-xl hover:bg-white/50 hover:shadow-[0_14px_36px_rgba(20,83,101,0.12)] hover:ring-white/70"
                  )}
                >
                  <div className="w-full overflow-hidden">
                    <div
                      role="button"
                      tabIndex={0}
                      className="min-w-0 cursor-pointer overflow-hidden pr-14 text-left outline-none"
                      onClick={() => !isEditing && onSelectSession(session.id)}
                    >
                      {isEditing ? (
                        <form onSubmit={submitRename} className="flex min-w-0 items-center gap-2">
                          <Input
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                            className="h-7 w-full rounded-lg border-white/50 bg-white/45 px-2 py-1 text-sm shadow-none backdrop-blur focus-visible:ring-2 focus-visible:ring-teal-500/25"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        </form>
                      ) : (
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-950">
                            {session.title}
                          </span>
                          {isBusy && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600 shadow-[0_0_0_3px_rgba(13,148,136,0.12)]" />
                          )}
                        </div>
                      )}
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                        {session.preview}
                      </p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] font-medium text-slate-500">
                        <span>{formatSessionTime(session.updatedAt)}</span>
                        {session.model && (
                          <span className="truncate">{session.model}</span>
                        )}
                      </div>
                    </div>
                    <div className={cn(
                      "absolute right-3 top-3 flex items-center gap-0.5 transition-opacity",
                      isEditing
                        ? "opacity-100"
                        : "opacity-100 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100"
                    )}>
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-slate-500 hover:bg-white/55 hover:text-slate-900"
                            onClick={cancelEditing}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            className="h-7 w-7 rounded-lg bg-slate-950/90 text-white hover:bg-slate-900"
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
                            className={actionButtonClass}
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
                            className="h-7 w-7 rounded-lg text-slate-500 transition-colors hover:bg-red-50/80 hover:text-red-600"
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
      </div>
    </aside>
  );
}
