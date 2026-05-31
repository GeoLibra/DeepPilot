import {
  RESEARCH_PROGRESS_COMPLETE_PERCENT,
  RESEARCH_PROGRESS_INITIAL_PERCENT,
  RESEARCH_PROGRESS_STEPS,
} from "./constants";
import type {
  ProcessedEvent,
  ResearchProgress,
  ResearchProgressPhase,
  ResearchProgressStep,
} from "./types";

const phaseByTitleMatch: Array<[string, ResearchProgressPhase]> = [
  ["planning", "planning"],
  ["generating", "queries"],
  ["query", "queries"],
  ["research", "research"],
  ["reflection", "reflection"],
  ["finalizing", "finalize"],
  ["formatting", "visuals"],
];

function getStep(phase: ResearchProgressPhase): ResearchProgressStep {
  return (
    RESEARCH_PROGRESS_STEPS.find((step) => step.phase === phase) ||
    RESEARCH_PROGRESS_STEPS[0]
  );
}

function getEventPhase(event: ProcessedEvent): ResearchProgressPhase {
  if (event.phase) return event.phase;

  const normalizedTitle = event.title.toLowerCase();
  return (
    phaseByTitleMatch.find(([match]) => normalizedTitle.includes(match))?.[1] ||
    "planning"
  );
}

function getProgressPercent(
  step: ResearchProgressStep,
  phaseEventCount: number
): number {
  return Math.min(
    step.ceilingPercent,
    step.basePercent + Math.max(phaseEventCount - 1, 0) * step.incrementPercent
  );
}

export function deriveResearchProgress(
  processedEvents: ProcessedEvent[],
  isLoading: boolean
): ResearchProgress {
  const phaseCounts = new Map<ResearchProgressPhase, number>();
  const completedPhases = new Set<ResearchProgressPhase>();
  let activeStep = RESEARCH_PROGRESS_STEPS[0];

  processedEvents.forEach((event) => {
    const phase = getEventPhase(event);
    phaseCounts.set(phase, (phaseCounts.get(phase) || 0) + 1);
    completedPhases.add(phase);

    const eventStep = getStep(phase);
    if (eventStep.basePercent >= activeStep.basePercent) {
      activeStep = eventStep;
    }
  });

  if (!isLoading && processedEvents.length > 0) {
    return {
      percent: RESEARCH_PROGRESS_COMPLETE_PERCENT,
      label: "Research complete",
      activePhase: activeStep.phase,
      isComplete: true,
      steps: RESEARCH_PROGRESS_STEPS,
      completedPhases: RESEARCH_PROGRESS_STEPS.map((step) => step.phase),
    };
  }

  if (processedEvents.length === 0) {
    return {
      percent: RESEARCH_PROGRESS_INITIAL_PERCENT,
      label: RESEARCH_PROGRESS_STEPS[0].activeLabel,
      activePhase: RESEARCH_PROGRESS_STEPS[0].phase,
      isComplete: false,
      steps: RESEARCH_PROGRESS_STEPS,
      completedPhases: [],
    };
  }

  return {
    percent: getProgressPercent(
      activeStep,
      phaseCounts.get(activeStep.phase) || 1
    ),
    label: activeStep.activeLabel,
    activePhase: activeStep.phase,
    isComplete: false,
    steps: RESEARCH_PROGRESS_STEPS,
    completedPhases: Array.from(completedPhases),
  };
}
