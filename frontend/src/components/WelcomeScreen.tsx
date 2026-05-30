import { InputForm } from "./InputForm";
import type { ModelOption } from "@/types";

interface WelcomeScreenProps {
  handleSubmit: (
    submittedInputValue: string,
    effort: string,
    model: string
  ) => void;
  onCancel: () => void;
  isLoading: boolean;
  modelOptions: ModelOption[];
  error?: string | null;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  handleSubmit,
  onCancel,
  isLoading,
  modelOptions,
  error,
}) => (
  <div className="relative mx-auto flex h-full w-full max-w-4xl flex-1 flex-col items-center justify-center gap-7 px-5 text-center">
    <div className="relative z-10 space-y-3">
      <p className="glass-control mx-auto inline-flex rounded-full px-4 py-1.5 text-sm font-semibold text-teal-900">
        DeepPilot Research
      </p>
      <h1 className="text-3xl font-semibold tracking-normal text-slate-950 md:text-5xl">
        Research with receipts.
      </h1>
      <p className="mx-auto max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
        Search, compare sources, and turn messy context into a cited briefing.
      </p>
    </div>
    <div className="relative z-10 w-full">
      {error && (
        <div className="mx-auto mb-4 max-w-2xl rounded-xl border border-red-100/70 bg-red-50/75 p-3 text-left text-sm text-red-700 shadow-sm backdrop-blur">
          <strong>Error:</strong> {error}
        </div>
      )}
      <InputForm
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onCancel={onCancel}
        hasHistory={false}
        modelOptions={modelOptions}
      />
    </div>
  </div>
);
