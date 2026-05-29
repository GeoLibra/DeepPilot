"""Migrate file-backed LangGraph dev sessions into a running LangGraph API.

This script reads the old local `.langgraph_api/.langgraph_ops.pckl` cache and
imports completed DeepPilot sessions into the currently running API, typically
the database-backed Docker stack started with `make dev`.
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID


DEFAULT_API_URL = "http://127.0.0.1:2026"
DEFAULT_SOURCE_DIR = Path(__file__).resolve().parents[1] / ".langgraph_api"
OPS_FILENAME = ".langgraph_ops.pckl"
APP_METADATA_KEY = "deeppilot"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import old file-backed LangGraph sessions into a running API."
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help="Directory containing .langgraph_ops.pckl.",
    )
    parser.add_argument(
        "--api-url",
        default=os.getenv("LANGGRAPH_API_URL", DEFAULT_API_URL),
        help="Target LangGraph API URL, e.g. http://127.0.0.1:2026.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print import candidates without writing to the target API.",
    )
    parser.add_argument(
        "--include-errors",
        action="store_true",
        help="Also import errored threads if they contain an AI answer.",
    )
    parser.add_argument(
        "--all-with-messages",
        action="store_true",
        help="Import any thread with messages, even if it has no AI answer.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maximum number of sessions to import. 0 means no limit.",
    )
    return parser.parse_args()


def load_ops(source_dir: Path) -> dict[str, Any]:
    # Some pickled classes import langgraph_api.config at load time. These
    # defaults are enough for local deserialization and are not used for writes.
    os.environ.setdefault("DATABASE_URI", ":memory:")
    os.environ.setdefault("REDIS_URI", "fake")
    os.environ.setdefault("MIGRATIONS_PATH", "__inmem")

    path = source_dir / OPS_FILENAME
    if not path.exists():
        raise FileNotFoundError(f"Could not find {path}")
    with path.open("rb") as file:
        return pickle.load(file)


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return " ".join(value.split())
    if isinstance(value, list):
        return " ".join(normalize_text(item) for item in value).strip()
    if isinstance(value, dict):
        if isinstance(value.get("text"), str):
            return normalize_text(value["text"])
        if "content" in value:
            return normalize_text(value["content"])
    return " ".join(str(value).split())


def truncate(value: str, max_length: int) -> str:
    value = normalize_text(value)
    if len(value) <= max_length:
        return value
    return value[: max_length - 1].rstrip() + "..."


def message_type(message: Any) -> str:
    if isinstance(message, dict):
        return str(message.get("type") or message.get("role") or "")
    return str(getattr(message, "type", "") or getattr(message, "role", ""))


def message_content(message: Any) -> str:
    if isinstance(message, dict):
        return normalize_text(message.get("content"))
    return normalize_text(getattr(message, "content", ""))


def serialize(value: Any) -> Any:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, list | tuple | set):
        return [serialize(item) for item in value]
    if isinstance(value, dict):
        return {str(key): serialize(item) for key, item in value.items()}

    # LangChain message objects expose the fields the frontend expects.
    if hasattr(value, "content") and hasattr(value, "type"):
        payload = {
            "type": getattr(value, "type", None),
            "content": getattr(value, "content", None),
        }
        message_id = getattr(value, "id", None)
        if message_id:
            payload["id"] = message_id
        additional_kwargs = getattr(value, "additional_kwargs", None)
        if additional_kwargs:
            payload["additional_kwargs"] = additional_kwargs
        return serialize(payload)

    try:
        return serialize(value.model_dump())
    except Exception:
        return str(value)


def has_ai_answer(values: dict[str, Any]) -> bool:
    messages = values.get("messages") or []
    for message in messages:
        if message_type(message) == "ai" and message_content(message):
            return True
    return bool(normalize_text(values.get("final_answer")))


def has_messages(values: dict[str, Any]) -> bool:
    return bool(values.get("messages"))


def first_human_text(values: dict[str, Any]) -> str:
    for message in values.get("messages") or []:
        if message_type(message) == "human":
            return message_content(message)
    return ""


def last_message_text(values: dict[str, Any]) -> str:
    messages = values.get("messages") or []
    return message_content(messages[-1]) if messages else ""


def session_metadata(thread: dict[str, Any], values: dict[str, Any]) -> dict[str, Any]:
    old_metadata = serialize(thread.get("metadata") or {})
    title = truncate(str(old_metadata.get("title") or first_human_text(values)), 56)
    preview = truncate(
        str(old_metadata.get("last_message_preview") or last_message_text(values)),
        120,
    )
    metadata = {
        **old_metadata,
        "app": APP_METADATA_KEY,
        "title": title or "Imported session",
        "title_source": old_metadata.get("title_source") or "auto",
        "last_message_preview": preview,
        "migrated_from": "langgraph_file_cache",
        "migrated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }
    reasoning_model = values.get("reasoning_model")
    if reasoning_model:
        metadata["last_model"] = str(reasoning_model)
    return metadata


def import_candidates(
    ops: dict[str, Any],
    *,
    include_errors: bool,
    all_with_messages: bool,
) -> list[dict[str, Any]]:
    threads = ops.get("threads") or []
    candidates: list[dict[str, Any]] = []
    for thread in threads:
        values = thread.get("values") or {}
        if not isinstance(values, dict):
            continue
        if not has_messages(values):
            continue
        if not all_with_messages and not has_ai_answer(values):
            continue
        if thread.get("status") == "error" and not include_errors:
            continue
        candidates.append(thread)
    candidates.sort(key=lambda item: item.get("updated_at") or item.get("created_at"))
    return candidates


def request_json(api_url: str, method: str, path: str, payload: dict[str, Any]) -> Any:
    url = api_url.rstrip("/") + path
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method=method,
    )
    try:
        with urlopen(request, timeout=60) as response:
            body = response.read()
            return json.loads(body) if body else None
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed: {exc.code} {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not connect to {url}: {exc.reason}") from exc


def import_thread(api_url: str, thread: dict[str, Any]) -> None:
    thread_id = str(thread["thread_id"])
    values = serialize(thread.get("values") or {})
    metadata = session_metadata(thread, thread.get("values") or {})

    request_json(
        api_url,
        "POST",
        "/threads",
        {
            "thread_id": thread_id,
            "metadata": metadata,
            "if_exists": "do_nothing",
        },
    )
    request_json(
        api_url,
        "POST",
        f"/threads/{thread_id}/state",
        {
            "values": values,
            "as_node": "visualize_answer",
        },
    )


def main() -> int:
    args = parse_args()
    try:
        ops = load_ops(args.source_dir)
    except Exception as exc:
        print(f"Failed to load local sessions: {exc}", file=sys.stderr)
        return 1

    candidates = import_candidates(
        ops,
        include_errors=args.include_errors,
        all_with_messages=args.all_with_messages,
    )
    if args.limit > 0:
        candidates = candidates[: args.limit]

    print(f"Found {len(candidates)} importable session(s).")
    for index, thread in enumerate(candidates, start=1):
        values = thread.get("values") or {}
        title = truncate(first_human_text(values), 80) or str(thread["thread_id"])
        messages = values.get("messages") or []
        print(f"{index:>3}. {thread['thread_id']} [{thread.get('status')}] {len(messages)} messages - {title}")

        if not args.dry_run:
            import_thread(args.api_url, thread)

    if args.dry_run:
        print("Dry run only. Re-run without --dry-run to import.")
    else:
        print("Import complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

