"""Local file-ingest orchestration for dropped files."""

from __future__ import annotations

import base64
import json
import mimetypes
import threading
import time
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from openai import OpenAI

from service.config_service import DEFAULT_FILE_INGEST_PURPOSE, config_service
from utils.file_ingest_archive import (
    FileIngestSourceMeta,
    append_file_ingest_entry,
    normalize_file_ingest_folder_path,
    resolve_file_ingest_note_path,
    write_file_ingest_archive,
)

MAX_FILES_PER_JOB = 8
MAX_TEXT_CHARS_PER_FILE = 12000
MAX_IMAGE_BYTES = 4_000_000
TEXT_SNIFF_BYTES = 4096
DEFAULT_FILE_INGEST_FOLDER = "inbox"

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
CODE_EXTENSIONS = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".css",
    ".go",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".lua",
    ".md",
    ".mjs",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".sh",
    ".sql",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}


@dataclass(slots=True)
class FileIngestTarget:
    folder_path: str
    purpose: str


@dataclass(slots=True)
class PreparedSource:
    path: Path
    name: str
    kind: str
    size_bytes: int
    truncated: bool
    text_excerpt: str | None = None
    image_data_uri: str | None = None

    def to_archive_meta(self) -> FileIngestSourceMeta:
        return FileIngestSourceMeta(
            name=self.name,
            original_path=str(self.path),
            kind=self.kind,
            size_bytes=self.size_bytes,
            truncated=self.truncated,
        )


@dataclass(slots=True)
class RoutedOutput:
    folder_path: str
    purpose: str
    content: str

    def to_result_payload(self, note_relative_path: str) -> dict[str, str]:
        return {
            "folderPath": self.folder_path,
            "noteRelativePath": note_relative_path,
            "purpose": self.purpose,
        }


class FileIngestService:
    def __init__(self) -> None:
        self._job_lock = threading.Lock()
        self._active_job_id: str | None = None
        self.reload_config()

    def reload_config(self) -> None:
        self.api_key = str(config_service.get("openai_api_key") or "").strip()
        self.base_url = str(config_service.get("openai_base_url") or "").strip()
        self.model_name = str(config_service.get("openai_model") or "").strip()
        self.feature_enabled = config_service.get_bool("feature_file_ingest_enabled")
        self.targets = _parse_configured_targets(
            str(config_service.get("file_ingest_targets") or "")
        )

    def start_job(
        self,
        raw_paths: Sequence[str],
        *,
        on_started: Callable[[dict[str, Any]], None] | None = None,
        on_finished: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        self.reload_config()
        if not self.feature_enabled:
            return {
                "ok": False,
                "error": "File ingest is disabled. Enable it in Settings > Features.",
            }

        paths = self._normalize_paths(raw_paths)
        if not paths:
            return {"ok": False, "error": "No local files were dropped."}

        with self._job_lock:
            if self._active_job_id is not None:
                return {
                    "ok": False,
                    "error": "A file ingest job is already running. Wait for it to finish first.",
                }
            job_id = self._make_job_id()
            self._active_job_id = job_id

        started_payload = {
            "ok": True,
            "jobId": job_id,
            "sourceCount": len(paths),
            "files": [path.name for path in paths],
            "targetFolders": [target.folder_path for target in self.targets],
        }
        if on_started is not None:
            on_started(started_payload)

        threading.Thread(
            target=self._run_job_thread,
            args=(job_id, paths, on_finished),
            daemon=True,
        ).start()
        return {"ok": True, "jobId": job_id}

    def _run_job_thread(
        self,
        job_id: str,
        paths: list[Path],
        on_finished: Callable[[dict[str, Any]], None] | None,
    ) -> None:
        try:
            result = self._ingest_paths(job_id, paths)
        except Exception as exc:
            result = {"ok": False, "jobId": job_id, "error": str(exc)}
        finally:
            with self._job_lock:
                self._active_job_id = None

        if on_finished is not None:
            on_finished(result)

    def _ingest_paths(self, job_id: str, paths: list[Path]) -> dict[str, Any]:
        started_at = time.perf_counter()
        prepared_sources, warnings = self._prepare_sources(paths)
        if not prepared_sources:
            raise ValueError("None of the dropped files could be prepared for ingest.")

        routed_outputs, routing_summary = self._generate_routed_outputs(
            prepared_sources,
            self.targets,
            warnings,
        )

        collected_at = time.strftime("%Y-%m-%d %H:%M:%S")
        include_warnings_in_blocks = len(routed_outputs) == 1
        total_appended_bytes = 0
        output_summaries: list[dict[str, str]] = []
        archive_outputs: list[dict[str, Any]] = []

        for routed_output in routed_outputs:
            note_relative_path, note_path = resolve_file_ingest_note_path(
                routed_output.folder_path,
                collected_at,
            )
            target_block = self._build_target_block(
                collected_at=collected_at,
                prepared_sources=prepared_sources,
                result_text=routed_output.content,
                warnings=warnings if include_warnings_in_blocks else [],
            )
            total_appended_bytes += append_file_ingest_entry(note_path, target_block)

            output_payload = routed_output.to_result_payload(note_relative_path)
            output_summaries.append(output_payload)
            archive_outputs.append({**output_payload, "content": routed_output.content})

        archive_relative_path = write_file_ingest_archive(
            job_id=job_id,
            created_at=collected_at,
            configured_targets=[
                {"folderPath": target.folder_path, "purpose": target.purpose}
                for target in self.targets
            ],
            sources=[source.to_archive_meta() for source in prepared_sources],
            outputs=archive_outputs,
            warnings=warnings,
            summary=routing_summary,
        )

        duration_ms = (time.perf_counter() - started_at) * 1000
        print(f"[file_ingest] Job {job_id} finished in {duration_ms:.2f} ms")
        return {
            "ok": True,
            "jobId": job_id,
            "collectedAt": collected_at,
            "sourceCount": len(prepared_sources),
            "outputCount": len(output_summaries),
            "outputs": output_summaries,
            "archiveRelativePath": archive_relative_path,
            "warnings": warnings,
            "summary": routing_summary,
            "appendedBytes": total_appended_bytes,
        }

    def _prepare_sources(self, paths: list[Path]) -> tuple[list[PreparedSource], list[str]]:
        warnings: list[str] = []
        prepared_sources: list[PreparedSource] = []

        selected_paths = paths[:MAX_FILES_PER_JOB]
        if len(paths) > MAX_FILES_PER_JOB:
            warnings.append(
                f"Only the first {MAX_FILES_PER_JOB} dropped files were processed in this job."
            )

        for path in selected_paths:
            prepared_source, warning = self._prepare_source(path)
            if warning:
                warnings.append(warning)
            if prepared_source is not None:
                prepared_sources.append(prepared_source)

        return prepared_sources, warnings

    def _prepare_source(self, path: Path) -> tuple[PreparedSource | None, str | None]:
        if not path.is_file():
            return None, f"Skipped non-file path: {path}"

        try:
            size_bytes = path.stat().st_size
        except OSError as exc:
            return None, f"Failed to read file metadata for {path.name}: {exc}"

        kind = self._detect_source_kind(path)
        if kind == "image":
            return self._prepare_image_source(path, size_bytes)
        if kind in {"code", "text"}:
            return self._prepare_text_source(path, size_bytes, kind)
        return None, f"Skipped unsupported file type: {path.name}"

    def _prepare_text_source(
        self,
        path: Path,
        size_bytes: int,
        kind: str,
    ) -> tuple[PreparedSource | None, str | None]:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            return None, f"Failed to read {path.name}: {exc}"

        excerpt, truncated = _truncate_text(content, MAX_TEXT_CHARS_PER_FILE)
        if not excerpt.strip():
            return None, f"Skipped empty text file: {path.name}"

        return (
            PreparedSource(
                path=path,
                name=path.name,
                kind=kind,
                size_bytes=size_bytes,
                truncated=truncated,
                text_excerpt=excerpt,
            ),
            None,
        )

    def _prepare_image_source(
        self,
        path: Path,
        size_bytes: int,
    ) -> tuple[PreparedSource | None, str | None]:
        if size_bytes > MAX_IMAGE_BYTES:
            return (
                None,
                f"Skipped image larger than {MAX_IMAGE_BYTES} bytes: {path.name}",
            )

        try:
            image_bytes = path.read_bytes()
        except OSError as exc:
            return None, f"Failed to read image {path.name}: {exc}"

        mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
        image_data_uri = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('utf-8')}"
        return (
            PreparedSource(
                path=path,
                name=path.name,
                kind="image",
                size_bytes=size_bytes,
                truncated=False,
                image_data_uri=image_data_uri,
            ),
            None,
        )

    def _generate_routed_outputs(
        self,
        prepared_sources: list[PreparedSource],
        configured_targets: list[FileIngestTarget],
        warnings: list[str],
    ) -> tuple[list[RoutedOutput], str]:
        try:
            outputs, routing_summary, routing_warnings = self._request_routed_outputs(
                prepared_sources,
                configured_targets=configured_targets,
                include_image_data=True,
            )
            warnings.extend(routing_warnings)
            return outputs, routing_summary
        except Exception as exc:
            has_image_sources = any(source.kind == "image" for source in prepared_sources)
            if not has_image_sources:
                raise

            warnings.append(f"Image analysis fell back to metadata-only handling: {exc}")
            outputs, routing_summary, routing_warnings = self._request_routed_outputs(
                prepared_sources,
                configured_targets=configured_targets,
                include_image_data=False,
            )
            warnings.extend(routing_warnings)
            return outputs, routing_summary

    def _request_routed_outputs(
        self,
        prepared_sources: list[PreparedSource],
        *,
        configured_targets: list[FileIngestTarget],
        include_image_data: bool,
    ) -> tuple[list[RoutedOutput], str, list[str]]:
        self._validate_model_config()
        client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        prompt_text = _load_prompt_template().replace(
            "{{TARGET_OPTIONS}}",
            _format_target_options(configured_targets),
        )
        has_image_payload = include_image_data and any(
            source.kind == "image" and source.image_data_uri for source in prepared_sources
        )

        user_content: Any
        if has_image_payload:
            user_content = self._build_multimodal_user_content(prepared_sources)
        else:
            user_content = self._build_text_only_user_prompt(prepared_sources)

        started_at = time.perf_counter()
        completion = client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": prompt_text},
                {"role": "user", "content": user_content},
            ],
        )
        duration_ms = (time.perf_counter() - started_at) * 1000
        print(f"[file_ingest] Model completion in {duration_ms:.2f} ms")

        content = completion.choices[0].message.content if completion.choices else ""
        response_text = _extract_message_text(content).strip()
        if not response_text:
            raise RuntimeError("The model returned an empty file-ingest result.")

        return self._parse_routing_response(response_text, configured_targets)

    def _parse_routing_response(
        self,
        response_text: str,
        configured_targets: list[FileIngestTarget],
    ) -> tuple[list[RoutedOutput], str, list[str]]:
        warnings: list[str] = []
        fallback_target = configured_targets[0]

        try:
            payload = _parse_json_object(response_text)
        except ValueError as exc:
            warnings.append(
                "File ingest routing response was not valid JSON. "
                f"Used {fallback_target.folder_path} instead: {exc}"
            )
            fallback_text = response_text.strip() or "No content was returned."
            return (
                [
                    RoutedOutput(
                        folder_path=fallback_target.folder_path,
                        purpose=fallback_target.purpose,
                        content=fallback_text,
                    )
                ],
                self._build_summary(fallback_text),
                warnings,
            )

        configured_targets_by_path = {target.folder_path: target for target in configured_targets}
        raw_outputs = payload.get("outputs")
        merged_outputs: dict[str, list[str]] = {}

        if isinstance(raw_outputs, list):
            for raw_output in raw_outputs:
                if not isinstance(raw_output, dict):
                    continue

                raw_folder_path = raw_output.get("folderPath")
                if not isinstance(raw_folder_path, str) or not raw_folder_path.strip():
                    continue

                try:
                    normalized_folder_path = normalize_file_ingest_folder_path(raw_folder_path)
                except ValueError:
                    warnings.append(f"Ignored invalid folderPath from model: {raw_folder_path!r}.")
                    continue

                target = configured_targets_by_path.get(normalized_folder_path)
                if target is None:
                    warnings.append(
                        f"Ignored unconfigured folderPath from model: {normalized_folder_path}."
                    )
                    continue

                content = str(raw_output.get("content") or "").strip()
                if not content:
                    continue

                merged_outputs.setdefault(target.folder_path, []).append(content)

        if not merged_outputs:
            warnings.append(
                "Model did not select a usable target folder. "
                f"Used {fallback_target.folder_path} instead."
            )
            fallback_text = response_text.strip() or "No content was returned."
            return (
                [
                    RoutedOutput(
                        folder_path=fallback_target.folder_path,
                        purpose=fallback_target.purpose,
                        content=fallback_text,
                    )
                ],
                self._build_summary(fallback_text),
                warnings,
            )

        routed_outputs = [
            RoutedOutput(
                folder_path=folder_path,
                purpose=configured_targets_by_path[folder_path].purpose,
                content="\n\n".join(contents).strip(),
            )
            for folder_path, contents in merged_outputs.items()
        ]

        summary = str(payload.get("summary") or "").strip()
        if not summary:
            summary = self._build_summary(routed_outputs[0].content)
        return routed_outputs, summary, warnings

    def _build_multimodal_user_content(
        self,
        prepared_sources: list[PreparedSource],
    ) -> list[dict[str, Any]]:
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    "Extract and organize the useful information from these dropped local files. "
                    "Route the result into the most appropriate configured archive folder or folders."
                ),
            }
        ]

        for source in prepared_sources:
            descriptor_lines = [
                f"Source file: {source.name}",
                f"Original path: {source.path}",
                f"Kind: {source.kind}",
                f"Size: {source.size_bytes} bytes",
            ]
            if source.truncated:
                descriptor_lines.append("Note: textual content was truncated before ingest.")

            if source.kind == "image" and source.image_data_uri:
                content.append({"type": "text", "text": "\n".join(descriptor_lines)})
                content.append({"type": "image_url", "image_url": {"url": source.image_data_uri}})
                continue

            text_excerpt = (
                source.text_excerpt or "No textual extract was available. Use metadata only."
            )
            content.append(
                {
                    "type": "text",
                    "text": "\n".join([*descriptor_lines, "", "Extracted content:", text_excerpt]),
                }
            )

        return content

    def _build_text_only_user_prompt(self, prepared_sources: list[PreparedSource]) -> str:
        sections = [
            "Extract and organize the useful information from these dropped local files.",
            "Route the result into the most appropriate configured archive folder or folders.",
            "",
        ]

        for source in prepared_sources:
            sections.extend(
                [
                    f"Source file: {source.name}",
                    f"Original path: {source.path}",
                    f"Kind: {source.kind}",
                    f"Size: {source.size_bytes} bytes",
                ]
            )
            if source.truncated:
                sections.append("Note: textual content was truncated before ingest.")
            sections.append("")

            if source.text_excerpt:
                sections.append("Extracted content:")
                sections.append(source.text_excerpt)
            else:
                sections.append("No visual content was attached for this image. Use metadata only.")

            sections.extend(["", "---", ""])

        return "\n".join(sections).strip()

    def _build_target_block(
        self,
        *,
        collected_at: str,
        prepared_sources: list[PreparedSource],
        result_text: str,
        warnings: list[str],
    ) -> str:
        lines = [f"## Collected at {collected_at}", "", "Source files:"]
        lines.extend(f"- {source.name}" for source in prepared_sources)
        lines.extend(["", result_text.strip()])

        if warnings:
            lines.extend(["", "Warnings:"])
            lines.extend(f"- {warning}" for warning in warnings)

        return "\n".join(lines).strip()

    def _build_summary(self, result_text: str) -> str:
        for line in result_text.splitlines():
            cleaned = line.strip().lstrip("#").strip()
            if cleaned:
                return cleaned[:220]
        return result_text.strip()[:220]

    def _detect_source_kind(self, path: Path) -> str:
        suffix = path.suffix.lower()
        if suffix in IMAGE_EXTENSIONS:
            return "image"
        if suffix in CODE_EXTENSIONS:
            return "code"

        mime_type = mimetypes.guess_type(path.name)[0] or ""
        if mime_type.startswith("text/"):
            return "text"
        if _looks_like_text(path):
            return "text"
        return "unsupported"

    def _normalize_paths(self, raw_paths: Sequence[str]) -> list[Path]:
        normalized_paths: list[Path] = []
        seen: set[str] = set()

        for raw_path in raw_paths:
            cleaned = str(raw_path or "").strip()
            if not cleaned:
                continue
            path = Path(cleaned).expanduser()
            try:
                resolved = path.resolve()
            except OSError:
                resolved = path

            dedupe_key = str(resolved).lower()
            if dedupe_key in seen or not resolved.is_file():
                continue

            seen.add(dedupe_key)
            normalized_paths.append(resolved)

        return normalized_paths

    def _validate_model_config(self) -> None:
        missing_fields: list[str] = []
        if not self.api_key:
            missing_fields.append("openai_api_key")
        if not self.base_url:
            missing_fields.append("openai_base_url")
        if not self.model_name:
            missing_fields.append("openai_model")
        if missing_fields:
            joined = ", ".join(missing_fields)
            raise ValueError(f"File ingest requires configured AI settings: {joined}")

    def _make_job_id(self) -> str:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        return f"file_ingest_{timestamp}_{uuid.uuid4().hex[:6]}"


@lru_cache(maxsize=1)
def _load_prompt_template() -> str:
    prompt_path = Path(__file__).resolve().parents[1] / "prompts" / "FileIngest.md"
    return prompt_path.read_text(encoding="utf-8")


def _default_configured_targets() -> list[FileIngestTarget]:
    return [
        FileIngestTarget(
            folder_path=DEFAULT_FILE_INGEST_FOLDER,
            purpose=DEFAULT_FILE_INGEST_PURPOSE,
        )
    ]


def _parse_configured_targets(raw_value: str) -> list[FileIngestTarget]:
    if not raw_value.strip():
        return _default_configured_targets()

    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError:
        return _default_configured_targets()

    if not isinstance(payload, list):
        return _default_configured_targets()

    parsed_targets: list[FileIngestTarget] = []
    seen_folder_paths: set[str] = set()

    for item in payload:
        if not isinstance(item, dict):
            continue

        try:
            folder_path = normalize_file_ingest_folder_path(item.get("folderPath"))
        except ValueError:
            continue

        if folder_path in seen_folder_paths:
            continue

        purpose = str(item.get("purpose") or "").strip() or DEFAULT_FILE_INGEST_PURPOSE
        parsed_targets.append(FileIngestTarget(folder_path=folder_path, purpose=purpose))
        seen_folder_paths.add(folder_path)

    return parsed_targets or _default_configured_targets()


def _format_target_options(configured_targets: list[FileIngestTarget]) -> str:
    return "\n".join(
        f"- folderPath: {target.folder_path}\n  purpose: {target.purpose}"
        for target in configured_targets
    )


def _extract_message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if isinstance(item, dict):
            text = item.get("text")
        else:
            text = getattr(item, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)
    return "\n".join(parts)


def _parse_json_object(raw_text: str) -> dict[str, Any]:
    stripped = _strip_code_fences(raw_text)

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        start_index = stripped.find("{")
        end_index = stripped.rfind("}")
        if start_index == -1 or end_index == -1 or end_index <= start_index:
            raise ValueError("No JSON object found in the model response.") from None
        try:
            payload = json.loads(stripped[start_index : end_index + 1])
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON object in the model response: {exc}") from exc

    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON object in the model response.")
    return payload


def _strip_code_fences(raw_text: str) -> str:
    stripped = raw_text.strip()
    if stripped.startswith("```") and stripped.endswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            return "\n".join(lines[1:-1]).strip()
    return stripped


def _looks_like_text(path: Path) -> bool:
    try:
        sample = path.read_bytes()[:TEXT_SNIFF_BYTES]
    except OSError:
        return False
    if not sample:
        return True
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def _truncate_text(text: str, max_chars: int) -> tuple[str, bool]:
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return cleaned, False

    head_length = max_chars // 2
    tail_length = max_chars - head_length
    truncated_text = (
        f"{cleaned[:head_length]}\n\n...[truncated for file ingest]...\n\n{cleaned[-tail_length:]}"
    )
    return truncated_text, True


file_ingest_service = FileIngestService()
