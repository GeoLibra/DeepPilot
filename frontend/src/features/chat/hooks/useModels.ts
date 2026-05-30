import { useState, useEffect } from "react";
import type { ModelOption } from "@/types";
import { FALLBACK_MODEL_OPTIONS } from "@/lib/constants";

export function useModels() {
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(FALLBACK_MODEL_OPTIONS);

  useEffect(() => {
    let cancelled = false;

    fetch("/models")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load model list: ${response.status}`);
        }
        return response.json();
      })
      .then((data: { models?: ModelOption[] }) => {
        if (cancelled || !Array.isArray(data.models) || data.models.length === 0) {
          return;
        }
        setModelOptions(data.models);
      })
      .catch((fetchError) => {
        console.warn("Using fallback model list:", fetchError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { modelOptions };
}
