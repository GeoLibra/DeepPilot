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



export function deriveResearchProgress(
  processedEvents: ProcessedEvent[],
  isLoading: boolean
): ResearchProgress {
  const phaseCounts = new Map<ResearchProgressPhase, number>();
  const loopPhaseCounts = new Map<ResearchProgressPhase, number>();
  const completedPhases = new Set<ResearchProgressPhase>();
  
  let activeStep = RESEARCH_PROGRESS_STEPS[0];
  let currentLoop = 0;
  let maxLoops = 0;
  
  let maxPercent = RESEARCH_PROGRESS_INITIAL_PERCENT;

  processedEvents.forEach((event) => {
    const phase = getEventPhase(event);
    phaseCounts.set(phase, (phaseCounts.get(phase) || 0) + 1);
    loopPhaseCounts.set(phase, (loopPhaseCounts.get(phase) || 0) + 1);
    completedPhases.add(phase);

    if (event.currentLoop !== undefined && event.currentLoop !== currentLoop) {
      currentLoop = event.currentLoop;
      loopPhaseCounts.clear();
      loopPhaseCounts.set(phase, 1); // This event is in the new loop
    }
    if (event.maxLoops !== undefined) maxLoops = event.maxLoops;

    activeStep = getStep(phase);
    
    let eventPercent = activeStep.basePercent;
    if (phase === "planning" || phase === "queries") {
      eventPercent = Math.min(
        activeStep.ceilingPercent,
        activeStep.basePercent + Math.max((phaseCounts.get(phase) || 1) - 1, 0) * activeStep.incrementPercent
      );
    } else if (phase === "research" || phase === "reflection") {
      const researchBase = 42;
      const reflectionCeil = 84;
      if (maxLoops > 0) {
        const effectiveLoopIndex = phase === "research" ? currentLoop : Math.max(0, currentLoop - 1);
        const loopSpan = (reflectionCeil - researchBase) / maxLoops;
        const baseForCurrentLoop = researchBase + effectiveLoopIndex * loopSpan;
        
        if (phase === "research") {
          const researchSpan = loopSpan * 0.6;
          eventPercent = Math.min(
            baseForCurrentLoop + researchSpan,
            baseForCurrentLoop + Math.max((loopPhaseCounts.get(phase) || 1) - 1, 0) * activeStep.incrementPercent
          );
        } else {
          eventPercent = Math.min(
            baseForCurrentLoop + loopSpan,
            baseForCurrentLoop + loopSpan * 0.6 + Math.max((loopPhaseCounts.get(phase) || 1) - 1, 0) * activeStep.incrementPercent
          );
        }
      } else {
        eventPercent = Math.min(
          activeStep.ceilingPercent,
          activeStep.basePercent + Math.max((phaseCounts.get(phase) || 1) - 1, 0) * activeStep.incrementPercent
        );
      }
    } else {
      eventPercent = Math.min(
        activeStep.ceilingPercent,
        activeStep.basePercent + Math.max((phaseCounts.get(phase) || 1) - 1, 0) * activeStep.incrementPercent
      );
    }
    
    if (eventPercent > maxPercent) {
      maxPercent = eventPercent;
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
    percent: Math.floor(maxPercent),
    label: activeStep.activeLabel,
    activePhase: activeStep.phase,
    isComplete: false,
    steps: RESEARCH_PROGRESS_STEPS,
    completedPhases: Array.from(completedPhases),
  };
}
