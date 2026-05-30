import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SquarePen, Brain, Send, StopCircle, Cpu, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { ModelOption } from "@/types";
import { DEFAULT_MODEL_NAME } from "@/lib/constants";

interface InputFormProps {
  onSubmit: (inputValue: string, effort: string, model: string) => void;
  onCancel: () => void;
  onNewSession?: () => void;
  isLoading: boolean;
  hasHistory: boolean;
  modelOptions: ModelOption[];
}

export const InputForm: React.FC<InputFormProps> = ({
  onSubmit,
  onCancel,
  onNewSession,
  isLoading,
  hasHistory,
  modelOptions,
}) => {
  const [internalInputValue, setInternalInputValue] = useState("");
  const [effort, setEffort] = useState("medium");
  const [model, setModel] = useState(
    modelOptions.some((option) => option.name === DEFAULT_MODEL_NAME)
      ? DEFAULT_MODEL_NAME
      : modelOptions[0]?.name ?? DEFAULT_MODEL_NAME
  );

  useEffect(() => {
    if (modelOptions.length === 0) return;
    if (!modelOptions.some((option) => option.name === model)) {
      setModel(
        modelOptions.some((option) => option.name === DEFAULT_MODEL_NAME)
          ? DEFAULT_MODEL_NAME
          : modelOptions[0].name
      );
    }
  }, [model, modelOptions]);

  const handleInternalSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!internalInputValue.trim()) return;
    onSubmit(internalInputValue, effort, model);
    setInternalInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit with Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac)
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleInternalSubmit();
    }
  };

  const isSubmitDisabled = !internalInputValue.trim() || isLoading;
  const formChrome = hasHistory
    ? "bg-transparent px-4 pb-4 pt-3 md:px-6"
    : "bg-transparent p-0";
  const inputChrome = hasHistory
    ? "glass-card rounded-2xl px-4 pt-3"
    : "glass-card rounded-2xl px-4 pt-3 shadow-[0_26px_90px_rgba(36,76,104,0.18)]";
  const selectTriggerChrome =
    "h-9 cursor-pointer rounded-none border-0 bg-transparent px-2 text-sm text-slate-800 shadow-none outline-none ring-0 focus:border-transparent focus:ring-0 focus-visible:border-transparent focus-visible:ring-0 [&>span]:min-w-0 [&>span]:truncate";
  const controlChrome =
    "glass-control flex max-w-full flex-row items-center gap-2 rounded-xl px-3 text-slate-700";

  return (
    <form
      onSubmit={handleInternalSubmit}
      className={formChrome}
    >
      <div
        className={cn(
          "flex min-h-7 flex-row items-center justify-between text-slate-900",
          inputChrome
        )}
      >
        <Textarea
          value={internalInputValue}
          onChange={(e) => setInternalInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask DeepPilot to research a company, market, or event..."
          className="max-h-[200px] min-h-[56px] w-full resize-none border-0 bg-transparent text-slate-950 shadow-none outline-none placeholder:text-slate-500 focus:outline-none focus:ring-0 focus-visible:ring-0 md:text-base"
          rows={1}
        />
        <div className="-mt-3 shrink-0">
          {isLoading ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 cursor-pointer rounded-xl p-2 text-red-600 transition-all duration-200 hover:bg-red-50/80 hover:text-red-700"
              onClick={onCancel}
            >
              <StopCircle className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="default"
              className={`${
                isSubmitDisabled
                  ? "bg-white/35 text-slate-400 shadow-none"
                  : "bg-gradient-to-r from-slate-950 via-teal-900 to-cyan-800 text-white shadow-[0_12px_26px_rgba(15,118,110,0.24)] hover:brightness-110"
              } h-9 cursor-pointer rounded-xl px-3 py-2 text-sm transition-all duration-200`}
              disabled={isSubmitDisabled}
            >
              Search
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2">
          <div className={controlChrome}>
            <div className="flex shrink-0 flex-row items-center text-sm">
              <Brain className="mr-2 h-4 w-4 text-teal-700" />
              Effort
            </div>
            <Select value={effort} onValueChange={setEffort}>
              <SelectTrigger className={cn("w-[112px]", selectTriggerChrome)}>
                <SelectValue placeholder="Effort" />
              </SelectTrigger>
              <SelectContent className="glass-panel cursor-pointer rounded-xl border-white/50 bg-white/70 text-slate-700 shadow-[0_18px_50px_rgba(36,76,104,0.18)]">
                <SelectItem
                  value="low"
                  className="cursor-pointer rounded-lg hover:bg-white/60 focus:bg-white/60"
                >
                  Low
                </SelectItem>
                <SelectItem
                  value="medium"
                  className="cursor-pointer rounded-lg hover:bg-white/60 focus:bg-white/60"
                >
                  Medium
                </SelectItem>
                <SelectItem
                  value="high"
                  className="cursor-pointer rounded-lg hover:bg-white/60 focus:bg-white/60"
                >
                  High
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={controlChrome}>
            <div className="ml-1 flex shrink-0 flex-row items-center text-sm">
              <Cpu className="mr-2 h-4 w-4 text-teal-700" />
              Model
            </div>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className={cn("w-[280px] max-w-[52vw]", selectTriggerChrome)}>
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent className="glass-panel cursor-pointer rounded-xl border-white/50 bg-white/70 text-slate-700 shadow-[0_18px_50px_rgba(36,76,104,0.18)]">
                {modelOptions.map((option) => (
                  <SelectItem
                    key={option.name}
                    value={option.name}
                    className="cursor-pointer rounded-lg hover:bg-white/60 focus:bg-white/60"
                  >
                    <div className="flex items-center">
                      {option.supports_thinking ? (
                        <Sparkles className="mr-2 h-4 w-4 text-teal-700" />
                      ) : (
                        <Cpu className="mr-2 h-4 w-4 text-slate-400" />
                      )}
                      {option.display_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasHistory && (
          <Button
            type="button"
            className="glass-control cursor-pointer rounded-xl pl-3 text-slate-700 shadow-none hover:bg-white/60 hover:text-slate-950"
            variant="default"
            onClick={onNewSession}
          >
            <SquarePen size={16} />
            New Search
          </Button>
        )}
      </div>
    </form>
  );
};
