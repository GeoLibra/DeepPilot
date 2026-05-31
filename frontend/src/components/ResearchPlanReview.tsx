import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Pencil,
  Play,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchPlanReviewInterrupt } from "@/types";

interface ResearchPlanReviewProps {
  interrupt: ResearchPlanReviewInterrupt;
  onApprove: (planMarkdown: string) => void;
}

function numberedList(items: string[] | undefined) {
  if (!items || items.length === 0) return null;

  return (
    <ol className="space-y-2 text-sm leading-6 text-slate-700">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100/70 text-[11px] font-semibold text-teal-800">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function buildPlanMarkdown(interrupt: ResearchPlanReviewInterrupt) {
  const { plan } = interrupt;
  if (plan.markdown?.trim()) return plan.markdown.trim();

  const lines = [`# ${plan.title}`];
  if (plan.objective) lines.push("", "## Objective", plan.objective);
  if (plan.research_steps?.length) {
    lines.push("", "## Research websites");
    plan.research_steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  }
  if (plan.analysis_steps?.length) {
    lines.push("", "## Analyze results");
    plan.analysis_steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  }
  if (plan.report_outline?.length) {
    lines.push("", "## Generate report");
    plan.report_outline.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  }
  return lines.join("\n");
}

export function ResearchPlanReview({
  interrupt,
  onApprove,
}: ResearchPlanReviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const initialMarkdown = useMemo(() => buildPlanMarkdown(interrupt), [interrupt]);
  const [draftPlan, setDraftPlan] = useState(initialMarkdown);

  useEffect(() => {
    setDraftPlan(initialMarkdown);
    setIsEditing(false);
  }, [initialMarkdown]);

  const canStart = draftPlan.trim().length > 0;

  return (
    <section className="glass-card mx-auto w-full max-w-3xl rounded-3xl px-5 py-5 text-left md:px-7 md:py-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="glass-control mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-teal-800">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600">
            这是我针对该主题拟定的方案。如果你需要进行修改，请告诉我。
          </p>
          <h2 className="mt-2 break-words text-2xl font-semibold text-slate-950">
            {interrupt.plan.title}
          </h2>
          {interrupt.plan.objective && (
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {interrupt.plan.objective}
            </p>
          )}
        </div>
      </div>

      {isEditing ? (
        <Textarea
          value={draftPlan}
          onChange={(event) => setDraftPlan(event.target.value)}
          className="min-h-[260px] resize-y rounded-2xl border-white/55 bg-white/45 p-4 font-mono text-sm leading-6 text-slate-800 shadow-none backdrop-blur focus-visible:ring-2 focus-visible:ring-teal-600/25"
        />
      ) : (
        <div className="space-y-5">
          {interrupt.plan.research_steps?.length ? (
            <div className="grid gap-3 md:grid-cols-[36px_1fr]">
              <Search className="mt-1 h-5 w-5 text-teal-700" />
              <div>
                <h3 className="mb-2 text-base font-semibold text-slate-900">
                  研究网站
                </h3>
                {numberedList(interrupt.plan.research_steps)}
              </div>
            </div>
          ) : null}

          {interrupt.plan.analysis_steps?.length ? (
            <div className="grid gap-3 md:grid-cols-[36px_1fr]">
              <BarChart3 className="mt-1 h-5 w-5 text-teal-700" />
              <div>
                <h3 className="mb-2 text-base font-semibold text-slate-900">
                  分析结果
                </h3>
                {numberedList(interrupt.plan.analysis_steps)}
              </div>
            </div>
          ) : null}

          {interrupt.plan.report_outline?.length ? (
            <div className="grid gap-3 md:grid-cols-[36px_1fr]">
              <FileText className="mt-1 h-5 w-5 text-teal-700" />
              <div>
                <h3 className="mb-2 text-base font-semibold text-slate-900">
                  生成报告
                </h3>
                {numberedList(interrupt.plan.report_outline)}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {isEditing ? (
          <Button
            type="button"
            variant="ghost"
            className="glass-control rounded-xl text-slate-700 shadow-none hover:bg-white/65 hover:text-slate-950"
            onClick={() => {
              setDraftPlan(initialMarkdown);
              setIsEditing(false);
            }}
          >
            <X className="h-4 w-4" />
            取消修改
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="glass-control rounded-xl text-slate-700 shadow-none hover:bg-white/65 hover:text-slate-950"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-4 w-4" />
            修改方案
          </Button>
        )}
        <Button
          type="button"
          className="rounded-xl bg-gradient-to-r from-teal-700 via-cyan-700 to-sky-700 text-white shadow-[0_14px_30px_rgba(14,116,144,0.22)] hover:brightness-110"
          disabled={!canStart}
          onClick={() => onApprove(draftPlan.trim())}
        >
          <Play className="h-4 w-4" />
          开始研究
        </Button>
      </div>
    </section>
  );
}
