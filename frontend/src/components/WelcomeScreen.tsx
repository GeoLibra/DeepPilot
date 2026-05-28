import { InputForm, ModelOption } from "./InputForm";
import { ParticleBackground } from "./ParticleBackground";

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
  <div className="relative mx-auto flex h-full w-full max-w-4xl flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
    <ParticleBackground />
    <div className="relative z-10 space-y-2">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">
        DeepPilot Research
      </p>
      <p className="mx-auto max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
        Search, compare sources, and turn messy context into a cited briefing.
      </p>
    </div>
    <div className="relative z-10 w-full">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200 text-left mx-auto max-w-2xl">
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
