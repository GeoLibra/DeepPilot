export type ResearchProgressPhase =
  | "planning"
  | "queries"
  | "research"
  | "reflection"
  | "finalize"
  | "visuals";

export type ProcessedEvent = {
  title: string;
  data: unknown;
  phase?: ResearchProgressPhase;
  currentLoop?: number;
  maxLoops?: number;
};

export type ResearchProgressStep = {
  phase: ResearchProgressPhase;
  label: string;
  activeLabel: string;
  basePercent: number;
  ceilingPercent: number;
  incrementPercent: number;
};

export type ResearchProgress = {
  percent: number;
  label: string;
  activePhase: ResearchProgressPhase;
  isComplete: boolean;
  steps: ResearchProgressStep[];
  completedPhases: ResearchProgressPhase[];
};
