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

export type ModelOption = {
  name: string;
  display_name: string;
  model?: string;
  supports_thinking?: boolean;
  supports_vision?: boolean;
};

const DEFAULT_MODEL_NAME = "deepseek-v4-pro";

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
    ? "bg-transparent px-3 py-3 md:px-5"
    : "bg-transparent p-0";
  const inputChrome = hasHistory
    ? "rounded-2xl rounded-br-md border border-slate-200 bg-white px-4 pt-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
    : "rounded-2xl border border-slate-200 bg-white px-4 pt-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)]";
  const selectTriggerChrome =
    "h-9 cursor-pointer rounded-none border-0 bg-transparent px-2 text-sm shadow-none outline-none ring-0 focus:border-transparent focus:ring-0 focus-visible:border-transparent focus-visible:ring-0 [&>span]:min-w-0 [&>span]:truncate";

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
          className="max-h-[200px] min-h-[56px] w-full resize-none border-0 text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0 focus-visible:ring-0 md:text-base"
          rows={1}
        />
        <div className="-mt-3 shrink-0">
          {isLoading ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer rounded-full p-2 text-red-600 transition-all duration-200 hover:bg-red-50 hover:text-red-700"
              onClick={onCancel}
            >
              <StopCircle className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="ghost"
              className={`${
                isSubmitDisabled
                  ? "text-slate-400"
                  : "text-teal-700 hover:bg-teal-50 hover:text-teal-800"
              } cursor-pointer rounded-full px-3 py-2 text-base transition-all duration-200`}
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
          <div className="flex max-w-full flex-row items-center gap-2 rounded-xl bg-white px-3 text-slate-700 shadow-sm ring-1 ring-slate-200/80">
            <div className="flex shrink-0 flex-row items-center text-sm">
              <Brain className="mr-2 h-4 w-4 text-teal-700" />
              Effort
            </div>
            <Select value={effort} onValueChange={setEffort}>
              <SelectTrigger className={cn("w-[112px]", selectTriggerChrome)}>
                <SelectValue placeholder="Effort" />
              </SelectTrigger>
              <SelectContent className="cursor-pointer border-slate-200 bg-white text-slate-700 shadow-lg">
                <SelectItem
                  value="low"
                  className="cursor-pointer hover:bg-slate-100 focus:bg-slate-100"
                >
                  Low
                </SelectItem>
                <SelectItem
                  value="medium"
                  className="cursor-pointer hover:bg-slate-100 focus:bg-slate-100"
                >
                  Medium
                </SelectItem>
                <SelectItem
                  value="high"
                  className="cursor-pointer hover:bg-slate-100 focus:bg-slate-100"
                >
                  High
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex max-w-full flex-row items-center gap-2 rounded-xl bg-white px-3 text-slate-700 shadow-sm ring-1 ring-slate-200/80">
            <div className="ml-1 flex shrink-0 flex-row items-center text-sm">
              <Cpu className="mr-2 h-4 w-4 text-teal-700" />
              Model
            </div>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className={cn("w-[280px] max-w-[52vw]", selectTriggerChrome)}>
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent className="cursor-pointer border-slate-200 bg-white text-slate-700 shadow-lg">
                {modelOptions.map((option) => (
                  <SelectItem
                    key={option.name}
                    value={option.name}
                    className="cursor-pointer hover:bg-slate-100 focus:bg-slate-100"
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
            className="cursor-pointer rounded-xl border border-slate-200 bg-white pl-3 text-slate-700 shadow-sm hover:bg-slate-50"
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
