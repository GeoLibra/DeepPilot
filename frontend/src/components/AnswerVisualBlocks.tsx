import type { Infographic as InfographicInstance } from "@antv/infographic";
import type { Text as T8TextInstance } from "@antv/t8";
import { BarChart3, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { VisualBlock } from "@/types";

const INFOGRAPHIC_HEIGHT = 200;

interface AnswerVisualBlocksProps {
  blocks: VisualBlock[];
}



function T8Block({ block }: { block: VisualBlock }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let text: T8TextInstance | null = null;
    let unmount: (() => void) | undefined;
    let cancelled = false;
    setFailed(false);
    container.innerHTML = "";

    void import("@antv/t8")
      .then(({ Text }) => {
        if (cancelled) return;

        text = new Text(container);
        unmount = text
          .theme("light", {
            fontFamily: "inherit",
            fontSize: 14,
            lineHeight: 24,
            colorMetricName: "#111827",
            colorMetricValue: "#0f766e",
            colorDimensionValue: "#b45309",
            colorOtherValue: "#374151",
            colorPositive: "#047857",
            colorNegative: "#dc2626",
            colorBase: "#374151",
            colorHeadingBase: "#111827",
            colorEntityBase: "#374151",
            colorConclusion: "#0f766e",
            colorProportionShadow: "#ccfbf1",
            colorProportionFill: "#0f766e",
            colorLineStroke: "#0d9488",
            colorLink: "#0f766e",
          })
          .render(block.syntax);
      })
      .catch((error) => {
        console.error("Failed to render T8 block:", error);
        container.innerHTML = "";
        setFailed(true);
      });

    return () => {
      cancelled = true;
      unmount?.();
      text?.unmount();
      container.innerHTML = "";
    };
  }, [block.syntax]);

  return (
    <VisualFrame block={block} icon={<FileText className="h-4 w-4" />}>
      {failed ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {block.syntax}
        </pre>
      ) : (
        <div
          ref={containerRef}
          className="t8-container min-h-[100px] rounded-lg border border-slate-200 bg-white p-4 text-slate-800"
        />
      )}
    </VisualFrame>
  );
}

function InfographicBlock({ block }: { block: VisualBlock }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let infographic: InfographicInstance | null = null;
    let cancelled = false;
    let blankCheck: number | undefined;
    setFailed(false);
    container.innerHTML = "";

    void import("@antv/infographic")
      .then(({ Infographic }) => {
        if (cancelled) return;

        infographic = new Infographic({
          container,
          width: "100%",
          height: INFOGRAPHIC_HEIGHT,
          padding: [18, 16, 16, 16],
          theme: "light",
          themeConfig: {
            colorBg: "#ffffff",
            colorPrimary: "#0f766e",
            palette: ["#0f766e", "#d97706", "#2563eb", "#dc2626"],
          },
          svg: {
            background: false,
            style: {
              overflow: "visible",
            },
          },
        });
        infographic.render(block.syntax);
        blankCheck = window.setTimeout(() => {
          if (cancelled) return;
          const hasRenderedSurface = container.querySelector("svg, canvas");
          const svg = container.querySelector("svg");
          const drawableCount =
            svg?.querySelectorAll("path, rect, circle, text, line, polyline, polygon")
              .length ?? 0;
          const hasVisibleContent =
            Boolean(container.textContent?.trim()) || drawableCount > 2;
          if (!hasRenderedSurface || !hasVisibleContent) {
            container.innerHTML = "";
            setFailed(true);
          }
        }, 700);
      })
      .catch((error) => {
        console.error("Failed to render infographic block:", error);
        container.innerHTML = "";
        setFailed(true);
      });

    return () => {
      cancelled = true;
      if (blankCheck) window.clearTimeout(blankCheck);
      infographic?.destroy();
      container.innerHTML = "";
    };
  }, [block.syntax]);

  return (
    <VisualFrame block={block} icon={<BarChart3 className="h-4 w-4" />}>
      {failed ? (
        <NativeInfographic syntax={block.syntax} />
      ) : (
        <div
          ref={containerRef}
          className="mx-auto min-h-[200px] w-full max-w-[720px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm [&_svg]:block [&_svg]:h-full [&_svg]:max-h-[200px] [&_svg]:w-full"
        />
      )}
    </VisualFrame>
  );
}

function parseInfographicItems(syntax: string) {
  const lines = syntax.split("\n").map((line) => line.trimEnd());
  const title =
    lines
      .map((line) => line.trim())
      .find((line) => /^title\s+/i.test(line))
      ?.replace(/^title\s+/i, "")
      .trim() || "";
  const items: { label: string; desc: string }[] = [];
  let current: { label: string; desc: string } | null = null;

  // Match items starting with `- label ...`, `- title ...`, or bare `- ` followed by text
  const itemStartRe = /^-\s+(?:label|title)\s+(.*)/i;
  const bareItemRe = /^-\s+(\S.*)/;
  const descRe = /^(?:desc|description|content)\s+(.*)/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip section markers like "lists", "cards", "items", "data"
    if (/^(lists|cards|items|data|infographic\s)$/i.test(line)) continue;
    // Skip the top-level title line
    if (/^title\s+/i.test(line) && items.length === 0 && !current) continue;

    const itemMatch = line.match(itemStartRe) || line.match(bareItemRe);
    if (itemMatch && line.startsWith("-")) {
      if (current) items.push(current);
      current = { label: itemMatch[1].trim(), desc: "" };
    } else if (current) {
      const descMatch = line.match(descRe);
      if (descMatch) {
        current.desc = descMatch[1].trim();
      }
    }
  }

  if (current) items.push(current);
  return { title, items };
}

function NativeInfographic({ syntax }: { syntax: string }) {
  const parsed = parseInfographicItems(syntax);

  if (parsed.items.length === 0) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">
        {syntax}
      </pre>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {parsed.title && (
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-teal-700">
          {parsed.title}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {parsed.items.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-semibold text-teal-700">
                {index + 1}
              </span>
              <h4 className="min-w-0 break-words text-sm font-semibold text-slate-900">
                {item.label}
              </h4>
            </div>
            {item.desc && (
              <p className="break-words text-xs leading-5 text-slate-600">
                {item.desc}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualFrame({
  block,
  icon,
  children,
}: {
  block: VisualBlock;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
        <span className="text-teal-700">{icon}</span>
        <span className="min-w-0 break-words">{block.title}</span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function AnswerVisualBlocks({ blocks }: AnswerVisualBlocksProps) {
  if (blocks.length === 0) return null;

  return (
    <div className="mb-5 grid gap-3">
      {blocks.map((block, index) =>
        block.type === "t8" ? (
          <T8Block key={`${block.type}-${block.title}-${index}`} block={block} />
        ) : (
          <InfographicBlock
            key={`${block.type}-${block.title}-${index}`}
            block={block}
          />
        )
      )}
    </div>
  );
}
