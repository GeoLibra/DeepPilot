import type { Infographic as InfographicInstance } from "@antv/infographic";
import type { Text as T8TextInstance } from "@antv/t8";
import { BarChart3, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export type VisualBlock = {
  type: "t8" | "infographic";
  title: string;
  purpose?: string;
  syntax: string;
  priority?: number;
};

interface AnswerVisualBlocksProps {
  blocks: VisualBlock[];
}

function isVisualBlock(value: unknown): value is VisualBlock {
  if (!value || typeof value !== "object") return false;

  const block = value as Record<string, unknown>;
  return (
    (block.type === "t8" || block.type === "infographic") &&
    typeof block.title === "string" &&
    typeof block.syntax === "string" &&
    block.syntax.trim().length > 0
  );
}

export function getVisualBlocks(value: unknown): VisualBlock[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isVisualBlock)
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));
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
          .theme("dark", {
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 22,
            colorMetricName: "#f5f5f5",
            colorMetricValue: "#67e8f9",
            colorDimensionValue: "#fbbf24",
            colorPositive: "#fb7185",
            colorNegative: "#2dd4bf",
            colorBase: "rgba(245, 245, 245, 0.74)",
            colorHeadingBase: "#fafafa",
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
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-neutral-950 p-3 text-xs text-neutral-300">
          {block.syntax}
        </pre>
      ) : (
        <div
          ref={containerRef}
          className="min-h-[96px] rounded-md bg-neutral-900/70 p-3 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_p]:mb-2"
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
    setFailed(false);
    container.innerHTML = "";

    void import("@antv/infographic")
      .then(({ Infographic }) => {
        if (cancelled) return;

        infographic = new Infographic({
          container,
          width: "100%",
          height: 260,
          padding: [18, 16, 16, 16],
          theme: "dark",
          themeConfig: {
            colorBg: "#171717",
            colorPrimary: "#22d3ee",
            palette: ["#22d3ee", "#f59e0b", "#34d399", "#fb7185"],
          },
          svg: {
            background: false,
            style: {
              overflow: "visible",
            },
          },
        });
        infographic.render(block.syntax);
      })
      .catch((error) => {
        console.error("Failed to render infographic block:", error);
        container.innerHTML = "";
        setFailed(true);
      });

    return () => {
      cancelled = true;
      infographic?.destroy();
      container.innerHTML = "";
    };
  }, [block.syntax]);

  return (
    <VisualFrame block={block} icon={<BarChart3 className="h-4 w-4" />}>
      {failed ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-neutral-950 p-3 text-xs text-neutral-300">
          {block.syntax}
        </pre>
      ) : (
        <div
          ref={containerRef}
          className="min-h-[260px] overflow-hidden rounded-md bg-neutral-900/70 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
        />
      )}
    </VisualFrame>
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
    <section className="overflow-hidden rounded-lg border border-neutral-700/80 bg-neutral-950/40 shadow-sm">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 text-sm font-medium text-neutral-200">
        <span className="text-cyan-300">{icon}</span>
        <span>{block.title}</span>
      </div>
      <div className="p-3">{children}</div>
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
