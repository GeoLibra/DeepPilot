import type { ModelOption } from "@/types";

export const DEFAULT_MODEL_NAME = "deepseek-v4-pro";

export const FALLBACK_MODEL_OPTIONS: ModelOption[] = [
  {
    name: "deepseek-v4-pro",
    display_name: "DeepSeek V4 Pro (NVIDIA)",
  },
  {
    name: "kimi-k2.6",
    display_name: "Kimi K2.6 (NVIDIA)",
    supports_thinking: true,
    supports_vision: true,
  },
  {
    name: "deepseek-v4-flash",
    display_name: "DeepSeek V4 Flash (NVIDIA)",
    supports_thinking: true,
  },
  {
    name: "glm-5.1",
    display_name: "GLM 5.1 (NVIDIA)",
    supports_thinking: true,
  },
  {
    name: "minimax-m2.7",
    display_name: "Minimax M2.7 (NVIDIA)",
  },
  {
    name: "gpt-5.5",
    display_name: "GPT-5.5 (OpenAI)",
  },
];

export const ACTIVE_THREAD_STORAGE_KEY = "deeppilot.activeThreadId";

export const APP_METADATA_KEY = "deeppilot";
export const DEFAULT_SESSION_TITLE = "Untitled session";
export const SESSION_TITLE_LENGTH = 56;
export const SESSION_PREVIEW_LENGTH = 120;
export const RECENT_SESSION_RESTORE_MS = 12 * 60 * 60 * 1000;
export const DEFAULT_RESEARCH_EFFORT = "medium";
export const MESSAGE_COPY_FEEDBACK_MS = 2000;
export const MESSAGE_ACTION_FEEDBACK_MS = 1800;
