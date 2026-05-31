import type { ResearchProgressStep } from "./types";

export const RESEARCH_PROGRESS_COMPLETE_PERCENT = 100;
export const RESEARCH_PROGRESS_INITIAL_PERCENT = 8;
export const RESEARCH_PROGRESS_MAX_LIVE_PERCENT = 98;

export const RESEARCH_PROGRESS_STEPS: ResearchProgressStep[] = [
  {
    phase: "planning",
    label: "Plan",
    activeLabel: "Planning research",
    basePercent: 12,
    ceilingPercent: 18,
    incrementPercent: 2,
  },
  {
    phase: "queries",
    label: "Queries",
    activeLabel: "Generating queries",
    basePercent: 24,
    ceilingPercent: 34,
    incrementPercent: 4,
  },
  {
    phase: "research",
    label: "Research",
    activeLabel: "Gathering sources",
    basePercent: 42,
    ceilingPercent: 68,
    incrementPercent: 6,
  },
  {
    phase: "reflection",
    label: "Review",
    activeLabel: "Checking coverage",
    basePercent: 72,
    ceilingPercent: 84,
    incrementPercent: 4,
  },
  {
    phase: "finalize",
    label: "Answer",
    activeLabel: "Writing answer",
    basePercent: 90,
    ceilingPercent: 94,
    incrementPercent: 2,
  },
  {
    phase: "visuals",
    label: "Format",
    activeLabel: "Formatting result",
    basePercent: 97,
    ceilingPercent: RESEARCH_PROGRESS_MAX_LIVE_PERCENT,
    incrementPercent: 1,
  },
];
