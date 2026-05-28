import { InputForm, ModelOption } from "./InputForm";

interface WelcomeScreenProps {
  handleSubmit: (
    submittedInputValue: string,
    effort: string,
    model: string
  ) => void;
  onCancel: () => void;
  isLoading: boolean;
  modelOptions: ModelOption[];
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  handleSubmit,
  onCancel,
  isLoading,
  modelOptions,
}) => (
  <div className="mx-auto flex h-full w-full max-w-4xl flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
    <div className="space-y-2">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">
        DeepPilot Research
      </p>
      <p className="mx-auto max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
        Search, compare sources, and turn messy context into a cited briefing.
      </p>
    </div>
    <div className="w-full">
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
