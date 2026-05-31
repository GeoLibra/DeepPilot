import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Activity,
  Info,
  Search,
  TextSearch,
  Brain,
  Pen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ResearchProgress } from "@/features/chat/components/ResearchProgress";
import type { ProcessedEvent } from "@/features/chat/types";
import { deriveResearchProgress } from "@/features/chat/utils";

interface ActivityTimelineProps {
  processedEvents: ProcessedEvent[];
  isLoading: boolean;
}

export function ActivityTimeline({
  processedEvents,
  isLoading,
}: ActivityTimelineProps) {
  const [isTimelineCollapsed, setIsTimelineCollapsed] =
    useState<boolean>(false);
  const progress = deriveResearchProgress(processedEvents, isLoading);
  const getEventIcon = (title: string, index: number) => {
    if (index === 0 && isLoading && processedEvents.length === 0) {
      return <Loader2 className="h-4 w-4 animate-spin text-teal-700" />;
    }
    if (title.toLowerCase().includes("generating")) {
      return <TextSearch className="h-4 w-4 text-teal-700" />;
    } else if (title.toLowerCase().includes("thinking")) {
      return <Loader2 className="h-4 w-4 animate-spin text-teal-700" />;
    } else if (title.toLowerCase().includes("reflection")) {
      return <Brain className="h-4 w-4 text-teal-700" />;
    } else if (title.toLowerCase().includes("research")) {
      return <Search className="h-4 w-4 text-teal-700" />;
    } else if (title.toLowerCase().includes("finalizing")) {
      return <Pen className="h-4 w-4 text-teal-700" />;
    }
    return <Activity className="h-4 w-4 text-teal-700" />;
  };

  useEffect(() => {
    if (!isLoading && processedEvents.length !== 0) {
      setIsTimelineCollapsed(true);
    }
  }, [isLoading, processedEvents]);

  const formatEventData = (data: unknown) => {
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.map(String).join(", ");
    return JSON.stringify(data);
  };

  return (
    <section className="glass-control max-h-96 overflow-hidden rounded-2xl bg-white/35">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between border-b border-white/45 px-4 py-3 text-left text-sm text-slate-900 transition-colors hover:bg-white/25"
        onClick={() => setIsTimelineCollapsed(!isTimelineCollapsed)}
      >
        <span className="flex items-center gap-2 font-medium">
          <Search className="h-4 w-4 text-teal-700" />
          Research
        </span>
        {isTimelineCollapsed ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {!isTimelineCollapsed && (
        <>
          <ResearchProgress progress={progress} />
          <ScrollArea className="max-h-96 overflow-y-auto">
            <div className="px-4 py-4">
              {isLoading && processedEvents.length === 0 && (
                <div className="relative pl-8 pb-4">
                  <div className="absolute left-3 top-3.5 h-full w-px bg-white/55" />
                  <div className="glass-control absolute left-0.5 top-2 flex h-5 w-5 items-center justify-center rounded-lg text-teal-800">
                    <Loader2 className="h-3 w-3 animate-spin text-teal-700" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      Planning research...
                    </p>
                  </div>
                </div>
              )}
              {processedEvents.length > 0 ? (
                <div className="space-y-0">
                  {processedEvents.map((eventItem, index) => (
                    <div key={index} className="relative pl-8 pb-4">
                      {index < processedEvents.length - 1 ||
                      (isLoading && index === processedEvents.length - 1) ? (
                        <div className="absolute left-3 top-3.5 h-full w-px bg-white/55" />
                      ) : null}
                      <div className="glass-control absolute left-0.5 top-2 flex h-6 w-6 items-center justify-center rounded-lg">
                        {getEventIcon(eventItem.title, index)}
                      </div>
                      <div>
                        <p className="mb-1 text-sm font-semibold text-slate-900">
                          {eventItem.title}
                        </p>
                        <p className="break-words text-xs leading-relaxed text-slate-600">
                          {formatEventData(eventItem.data)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isLoading && processedEvents.length > 0 && (
                    <div className="relative pl-8 pb-4">
                      <div className="glass-control absolute left-0.5 top-2 flex h-5 w-5 items-center justify-center rounded-lg">
                        <Loader2 className="h-3 w-3 animate-spin text-teal-700" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          Working...
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : !isLoading ? (
                <div className="flex h-full flex-col items-center justify-center pt-10 text-slate-500">
                  <Info className="h-6 w-6 mb-3" />
                  <p className="text-sm">No activity to display.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Timeline will update during processing.
                  </p>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </>
      )}
    </section>
  );
}
