import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ResearchProgress as ResearchProgressState } from "../types";

interface ResearchProgressProps {
  progress: ResearchProgressState;
}

export function ResearchProgress({ progress }: ResearchProgressProps) {
  return (
    <div className="border-b border-white/45 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="glass-control flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-teal-800">
            {progress.isComplete ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
          </span>
          <span className="truncate text-sm font-medium text-slate-900">
            {progress.label}
          </span>
        </div>
        <span className="shrink-0 font-mono text-xs text-slate-500">
          {progress.percent}%
        </span>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label="Research progress"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-slate-950 via-teal-700 to-amber-500 transition-[width] duration-500 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {progress.steps.map((step) => {
          const isActive = step.phase === progress.activePhase;
          const isCompleted =
            progress.isComplete || progress.completedPhases.includes(step.phase);

          return (
            <div
              key={step.phase}
              className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300/80",
                  isCompleted && "bg-teal-600",
                  isActive && !progress.isComplete && "bg-slate-950"
                )}
              />
              <span
                className={cn(
                  "truncate",
                  isActive && "font-medium text-slate-900"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
