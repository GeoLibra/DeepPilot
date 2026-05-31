from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, TypeVar

import yaml
from langchain_google_genai import ChatGoogleGenerativeAI
from openai import APIConnectionError, APIError, APITimeoutError, OpenAI
from pydantic import BaseModel

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config.yaml"

StructuredOutput = TypeVar("StructuredOutput", bound=BaseModel)


class TextResponse(BaseModel):
    content: str


def _content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, str):
                chunks.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str):
                    chunks.append(text)
            else:
                text = getattr(item, "text", None) or getattr(item, "content", None)
                if isinstance(text, str):
                    chunks.append(text)
        if chunks:
            return "".join(chunks)
    if isinstance(content, dict):
        text = content.get("text") or content.get("content")
        if isinstance(text, str):
            return text
    text = getattr(content, "text", None) or getattr(content, "content", None)
    if isinstance(text, str):
        return text
    return str(content)


def _resolve_env_value(value: Any) -> Any:
    if isinstance(value, str) and value.startswith("$"):
        env_name = value[1:]
        resolved = os.getenv(env_name)
        if not resolved:
            raise ValueError(f"Environment variable {env_name} is not set")
        return resolved
    return value


def _resolve_optional_env_value(value: Any) -> Any:
    if isinstance(value, str) and value.startswith("$"):
        return os.getenv(value[1:])
    return value


@lru_cache(maxsize=1)
def load_model_configs() -> dict[str, dict[str, Any]]:
    if not CONFIG_PATH.exists():
        return {}

    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}

    models = data.get("models") or []
    configs: dict[str, dict[str, Any]] = {}
    for model in models:
        if not isinstance(model, dict):
            continue
        name = model.get("name")
        provider_model = model.get("model")
        if isinstance(name, str):
            configs[name] = model
        if isinstance(provider_model, str):
            configs.setdefault(provider_model, model)
    return configs


def list_model_options() -> list[dict[str, Any]]:
    seen: set[str] = set()
    options: list[dict[str, Any]] = []
    for model in load_model_configs().values():
        name = model.get("name")
        if not isinstance(name, str) or name in seen:
            continue
        seen.add(name)
        options.append(
            {
                "name": name,
                "display_name": model.get("display_name") or name,
                "model": model.get("model") or name,
                "supports_thinking": bool(model.get("supports_thinking", False)),
                "supports_vision": bool(model.get("supports_vision", False)),
            }
        )
    return options


def _get_model_config(model_name: str) -> dict[str, Any] | None:
    return load_model_configs().get(model_name)


def _get_extra_body(model_config: dict[str, Any]) -> dict[str, Any] | None:
    extra_body: dict[str, Any] = {}
    configured_extra = model_config.get("extra_body")
    if isinstance(configured_extra, dict):
        extra_body.update(configured_extra)

    if model_config.get("supports_thinking", False):
        thinking_extra = (
            model_config.get("when_thinking_enabled", {}).get("extra_body", {})
            if isinstance(model_config.get("when_thinking_enabled"), dict)
            else {}
        )
        if isinstance(thinking_extra, dict):
            extra_body.update(thinking_extra)

    return extra_body or None


def _invoke_openai_compatible(
    model_config: dict[str, Any],
    prompt: str,
    *,
    temperature: float,
) -> str:
    client_kwargs = {"api_key": _resolve_env_value(model_config.get("api_key"))}
    api_base = model_config.get("api_base") or model_config.get("base_url")
    if api_base:
        client_kwargs["base_url"] = api_base

    client = OpenAI(**client_kwargs)
    stream = bool(model_config.get("stream", False))
    request: dict[str, Any] = {
        "model": model_config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "temperature": model_config.get("temperature", temperature),
        "top_p": model_config.get("top_p", 1),
        "stream": stream,
    }
    if "max_completion_tokens" in model_config:
        request["max_completion_tokens"] = model_config["max_completion_tokens"]
    else:
        request["max_tokens"] = model_config.get("max_tokens", 8192)
    extra_body = _get_extra_body(model_config)
    if extra_body:
        request["extra_body"] = extra_body

    try:
        completion = client.chat.completions.create(**request)
    except (APIConnectionError, APITimeoutError) as exc:
        model_name = model_config.get("name") or model_config["model"]
        provider_url = api_base or "OpenAI default API"
        extra_hint = ""
        if "integrate.api.nvidia.com" in provider_url:
            extra_hint = " For NVIDIA Integrate models, verify NVIDIA_API_KEY."
        raise RuntimeError(
            f"Could not connect to model provider for {model_name} at {provider_url}. "
            f"Check network/proxy access and the configured API key.{extra_hint}"
        ) from exc
    except APIError as exc:
        model_name = model_config.get("name") or model_config["model"]
        raise RuntimeError(f"Model provider request failed for {model_name}: {exc}") from exc

    if stream:
        chunks: list[str] = []
        for chunk in completion:
            if not getattr(chunk, "choices", None):
                continue
            delta = getattr(chunk.choices[0], "delta", None)
            content = getattr(delta, "content", None)
            if content:
                chunks.append(content)
        return "".join(chunks)

    if not completion.choices:
        return ""
    return completion.choices[0].message.content or ""


def _google_api_key(model_config: dict[str, Any], fallback: str | None = None) -> str | None:
    return (
        fallback
        or _resolve_optional_env_value(model_config.get("api_key"))
        or os.getenv("WEB_RESEARCH_API_KEY")
        or os.getenv("GEMINI_API_KEY")
    )


def _invoke_google_text_model(
    model_config: dict[str, Any],
    prompt: str,
    *,
    temperature: float,
    api_key: str | None = None,
) -> str:
    llm = ChatGoogleGenerativeAI(
        model=model_config.get("model") or model_config.get("name"),
        temperature=model_config.get("temperature", temperature),
        max_retries=2,
        api_key=_google_api_key(model_config, api_key),
    )
    result = llm.invoke(prompt)
    return _content_to_text(result.content)


def _extract_json_object(text: str) -> dict[str, Any]:
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    if fenced:
        return json.loads(fenced.group(1))

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model did not return a JSON object")
    return json.loads(text[start : end + 1])


def invoke_text_model(
    model_name: str,
    prompt: str,
    *,
    temperature: float = 0,
    api_key: str | None = None,
) -> TextResponse:
    model_config = _get_model_config(model_name)
    if model_config:
        if model_config.get("use") == "google_genai":
            return TextResponse(
                content=_invoke_google_text_model(
                    model_config,
                    prompt,
                    temperature=temperature,
                    api_key=api_key,
                )
            )
        return TextResponse(
            content=_invoke_openai_compatible(
                model_config,
                prompt,
                temperature=temperature,
            )
        )

    llm = ChatGoogleGenerativeAI(
        model=model_name,
        temperature=temperature,
        max_retries=2,
        api_key=api_key
        or os.getenv("WEB_RESEARCH_API_KEY")
        or os.getenv("GEMINI_API_KEY"),
    )
    result = llm.invoke(prompt)
    return TextResponse(content=_content_to_text(result.content))


def invoke_structured_model(
    model_name: str,
    prompt: str,
    output_schema: type[StructuredOutput],
    *,
    temperature: float = 0,
    api_key: str | None = None,
) -> StructuredOutput:
    model_config = _get_model_config(model_name)
    if model_config:
        if model_config.get("use") == "google_genai":
            llm = ChatGoogleGenerativeAI(
                model=model_config.get("model") or model_config.get("name"),
                temperature=model_config.get("temperature", temperature),
                max_retries=2,
                api_key=_google_api_key(model_config, api_key),
            )
            return llm.with_structured_output(output_schema).invoke(prompt)

        schema_prompt = (
            f"{prompt}\n\n"
            "Return only a valid JSON object instance matching this JSON schema. "
            "Do not return a JSON schema or a dictionary containing a 'properties' key. Return the raw data object directly.\n"
            "Do not include markdown fences or explanatory text.\n"
            f"{json.dumps(output_schema.model_json_schema(), ensure_ascii=False)}"
        )
        content = _invoke_openai_compatible(
            model_config,
            schema_prompt,
            temperature=temperature,
        )
        
        json_obj = _extract_json_object(content)
        # Some models mistakenly wrap the output in a "properties" key
        if "properties" in json_obj and isinstance(json_obj["properties"], dict):
            expected_keys = output_schema.model_fields.keys()
            # If the expected keys are inside "properties" and not at the top level, unwrap it
            if any(k in json_obj["properties"] for k in expected_keys) and not any(k in json_obj for k in expected_keys):
                json_obj = json_obj["properties"]
                
        return output_schema.model_validate(json_obj)

    llm = ChatGoogleGenerativeAI(
        model=model_name,
        temperature=temperature,
        max_retries=2,
        api_key=api_key
        or os.getenv("WEB_RESEARCH_API_KEY")
        or os.getenv("GEMINI_API_KEY"),
    )
    return llm.with_structured_output(output_schema).invoke(prompt)
