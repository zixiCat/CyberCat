"""Local file-ingest orchestration for dropped files."""

from __future__ import annotations

import base64
import json
import mimetypes
import re
import threading
import textwrap
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
    get_file_ingest_root,
    normalize_file_ingest_folder_path,
    normalize_file_ingest_note_suffix,
    resolve_file_ingest_note_path,
    write_file_ingest_archive,
)

MAX_FILES_PER_BATCH = 10
MAX_TEXT_CHARS_PER_FILE = 12000
MAX_IMAGE_BYTES = 4_000_000
TEXT_SNIFF_BYTES = 4096
MAX_TARGET_CONTEXT_CHARS_PER_FOLDER = 48000
MAX_TARGET_CONTEXT_NON_TEXT_EXAMPLES = 6
DEFAULT_FILE_INGEST_FOLDER = "inbox"
PURPOSE_NOTE_FILENAME_PATTERN = re.compile(
    r"\b(?:\d{4}|yyyy)-(?:\d{2}|mm)-(?:\d{2}|dd)[_-]([A-Za-z0-9][A-Za-z0-9 _-]*)\.md\b",
    re.IGNORECASE,
)

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
    note_suffix: str = ""

    def to_result_payload(self, note_relative_path: str) -> dict[str, str]:
        payload = {
            "folderPath": self.folder_path,
            "noteRelativePath": note_relative_path,
            "purpose": self.purpose,
        }
        if self.note_suffix:
            payload["noteSuffix"] = self.note_suffix
        return payload


@dataclass(slots=True)
class TargetFolderContext:
    folder_path: str
    purpose: str
    file_count: int
    readable_file_count: int
    skipped_source_file_count: int
    non_text_file_count: int
    truncated: bool
    text_excerpt: str
    non_text_examples: tuple[str, ...] = ()


@dataclass(slots=True)
class FileIngestBatchResult:
    prepared_sources: list[PreparedSource]
    output_summaries: list[dict[str, str]]
    archive_outputs: list[dict[str, Any]]
    warnings: list[str]
    summary: str
    appended_bytes: int


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
        collected_at = time.strftime("%Y-%m-%d %H:%M:%S")
        path_batches = self._create_path_batches(paths)
        warnings: list[str] = []
        prepared_sources: list[PreparedSource] = []
        batch_summaries: list[str] = []
        total_appended_bytes = 0
        output_summaries_by_key: dict[tuple[str, str, str], dict[str, str]] = {}
        archive_outputs_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}

        if len(path_batches) > 1:
            warnings.append(
                f"Processed {len(paths)} dropped files in {len(path_batches)} queued batches of up to {MAX_FILES_PER_BATCH} files."
            )

        for path_batch in path_batches:
            batch_result = self._ingest_path_batch(path_batch, collected_at)
            warnings.extend(batch_result.warnings)
            if not batch_result.prepared_sources:
                continue

            prepared_sources.extend(batch_result.prepared_sources)
            total_appended_bytes += batch_result.appended_bytes
            if batch_result.summary:
                batch_summaries.append(batch_result.summary)

            for output_payload in batch_result.output_summaries:
                output_key = (
                    output_payload["folderPath"],
                    output_payload["noteRelativePath"],
                    output_payload["purpose"],
                )
                output_summaries_by_key.setdefault(output_key, output_payload)

            for archive_output in batch_result.archive_outputs:
                output_key = (
                    archive_output["folderPath"],
                    archive_output["noteRelativePath"],
                    archive_output["purpose"],
                )
                existing_output = archive_outputs_by_key.get(output_key)
                if existing_output is None:
                    archive_outputs_by_key[output_key] = archive_output
                    continue

                existing_output["content"] = (
                    f"{existing_output['content']}\n\n{archive_output['content']}".strip()
                )

        if not prepared_sources:
            raise ValueError("None of the dropped files could be prepared for ingest.")

        routing_summary = self._build_job_summary(batch_summaries, len(path_batches))

        archive_relative_path = write_file_ingest_archive(
            job_id=job_id,
            created_at=collected_at,
            configured_targets=[
                {"folderPath": target.folder_path, "purpose": target.purpose}
                for target in self.targets
            ],
            sources=[source.to_archive_meta() for source in prepared_sources],
            outputs=list(archive_outputs_by_key.values()),
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
            "outputCount": len(output_summaries_by_key),
            "outputs": list(output_summaries_by_key.values()),
            "archiveRelativePath": archive_relative_path,
            "warnings": warnings,
            "summary": routing_summary,
            "appendedBytes": total_appended_bytes,
        }

    def _create_path_batches(self, paths: list[Path]) -> list[list[Path]]:
        return [
            paths[index : index + MAX_FILES_PER_BATCH]
            for index in range(0, len(paths), MAX_FILES_PER_BATCH)
        ]

    def _ingest_path_batch(
        self,
        path_batch: list[Path],
        collected_at: str,
    ) -> FileIngestBatchResult:
        batch_warnings: list[str] = []
        prepared_sources, prepare_warnings = self._prepare_sources(path_batch)
        batch_warnings.extend(prepare_warnings)
        if not prepared_sources:
            return FileIngestBatchResult(
                prepared_sources=[],
                output_summaries=[],
                archive_outputs=[],
                warnings=batch_warnings,
                summary="",
                appended_bytes=0,
            )

        routed_outputs, routing_summary = self._generate_routed_outputs(
            prepared_sources,
            self.targets,
            batch_warnings,
        )

        output_summaries: list[dict[str, str]] = []
        archive_outputs: list[dict[str, Any]] = []
        appended_bytes = 0

        for routed_output in routed_outputs:
            note_relative_path, note_path = resolve_file_ingest_note_path(
                routed_output.folder_path,
                collected_at,
                routed_output.note_suffix,
            )
            appended_bytes += append_file_ingest_entry(note_path, routed_output.content)

            output_payload = routed_output.to_result_payload(note_relative_path)
            output_summaries.append(output_payload)
            archive_outputs.append({**output_payload, "content": routed_output.content})

        return FileIngestBatchResult(
            prepared_sources=prepared_sources,
            output_summaries=output_summaries,
            archive_outputs=archive_outputs,
            warnings=batch_warnings,
            summary=routing_summary,
            appended_bytes=appended_bytes,
        )

    def _prepare_sources(self, paths: list[Path]) -> tuple[list[PreparedSource], list[str]]:
        warnings: list[str] = []
        prepared_sources: list[PreparedSource] = []

        for path in paths:
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
        target_contexts, target_context_warnings = self._collect_target_folder_contexts(
            configured_targets,
            prepared_sources,
        )
        warnings.extend(target_context_warnings)

        try:
            outputs, routing_summary, routing_warnings = self._request_routed_outputs(
                prepared_sources,
                configured_targets=configured_targets,
                include_image_data=True,
                target_contexts=target_contexts,
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
                target_contexts=target_contexts,
            )
            warnings.extend(routing_warnings)
            return outputs, routing_summary

    def _request_routed_outputs(
        self,
        prepared_sources: list[PreparedSource],
        *,
        configured_targets: list[FileIngestTarget],
        include_image_data: bool,
        target_contexts: list[TargetFolderContext],
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
            user_content = self._build_multimodal_user_content(prepared_sources, target_contexts)
        else:
            user_content = self._build_text_only_user_prompt(prepared_sources, target_contexts)

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
            fallback_text = self._normalize_output_content(
                response_text.strip() or "No content was returned."
            )
            return (
                [
                    RoutedOutput(
                        folder_path=fallback_target.folder_path,
                        purpose=fallback_target.purpose,
                        content=fallback_text,
                        note_suffix=_extract_note_suffix_from_purpose(fallback_target.purpose),
                    )
                ],
                self._build_summary(fallback_text),
                warnings,
            )

        configured_targets_by_path = {target.folder_path: target for target in configured_targets}
        raw_outputs = payload.get("outputs")
        merged_outputs: dict[tuple[str, str], list[str]] = {}

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

                note_suffix = self._resolve_note_suffix(
                    raw_output.get("noteSuffix"),
                    target.purpose,
                )
                content = self._normalize_output_content(str(raw_output.get("content") or ""))
                if not content:
                    continue

                merged_outputs.setdefault((target.folder_path, note_suffix), []).append(content)

        if not merged_outputs:
            warnings.append(
                "Model did not select a usable target folder. "
                f"Used {fallback_target.folder_path} instead."
            )
            fallback_text = self._normalize_output_content(
                response_text.strip() or "No content was returned."
            )
            return (
                [
                    RoutedOutput(
                        folder_path=fallback_target.folder_path,
                        purpose=fallback_target.purpose,
                        content=fallback_text,
                        note_suffix=_extract_note_suffix_from_purpose(fallback_target.purpose),
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
                note_suffix=note_suffix,
            )
            for (folder_path, note_suffix), contents in merged_outputs.items()
        ]

        summary = str(payload.get("summary") or "").strip()
        if not summary:
            summary = self._build_summary(routed_outputs[0].content)
        return routed_outputs, summary, warnings

    def _resolve_note_suffix(self, requested_note_suffix: Any, purpose: str) -> str:
        if isinstance(requested_note_suffix, str):
            normalized_note_suffix = normalize_file_ingest_note_suffix(requested_note_suffix)
            if normalized_note_suffix:
                return normalized_note_suffix
        return _extract_note_suffix_from_purpose(purpose)

    def _normalize_output_content(self, result_text: str) -> str:
        stripped = result_text.strip()
        if not stripped:
            return ""

        file_contents_match = re.search(r"(?im)^\s*file contents:\s*$", stripped)
        if file_contents_match:
            trailing_content = textwrap.dedent(stripped[file_contents_match.end() :]).strip()
            if trailing_content:
                return trailing_content

        return stripped

    def _collect_target_folder_contexts(
        self,
        configured_targets: list[FileIngestTarget],
        prepared_sources: list[PreparedSource],
    ) -> tuple[list[TargetFolderContext], list[str]]:
        source_path_keys = {_make_path_key(source.path) for source in prepared_sources}
        contexts: list[TargetFolderContext] = []
        warnings: list[str] = []

        for target in configured_targets:
            target_context, target_warnings = self._collect_target_folder_context(
                target,
                source_path_keys,
            )
            contexts.append(target_context)
            warnings.extend(target_warnings)

        return contexts, warnings

    def _collect_target_folder_context(
        self,
        target: FileIngestTarget,
        source_path_keys: set[str],
    ) -> tuple[TargetFolderContext, list[str]]:
        warnings: list[str] = []
        resolved_folder_path = _resolve_configured_target_folder(target.folder_path)

        if not resolved_folder_path.exists():
            return (
                TargetFolderContext(
                    folder_path=target.folder_path,
                    purpose=target.purpose,
                    file_count=0,
                    readable_file_count=0,
                    skipped_source_file_count=0,
                    non_text_file_count=0,
                    truncated=False,
                    text_excerpt="",
                ),
                warnings,
            )

        if not resolved_folder_path.is_dir():
            warnings.append(f"Configured file ingest target is not a folder: {target.folder_path}")
            return (
                TargetFolderContext(
                    folder_path=target.folder_path,
                    purpose=target.purpose,
                    file_count=0,
                    readable_file_count=0,
                    skipped_source_file_count=0,
                    non_text_file_count=0,
                    truncated=False,
                    text_excerpt="",
                ),
                warnings,
            )

        file_paths = sorted(
            (path for path in resolved_folder_path.rglob("*") if path.is_file()),
            key=lambda path: path.as_posix().lower(),
        )
        readable_blocks: list[str] = []
        readable_file_count = 0
        skipped_source_file_count = 0
        non_text_file_count = 0
        non_text_examples: list[str] = []

        for file_path in file_paths:
            if _make_path_key(file_path) in source_path_keys:
                skipped_source_file_count += 1
                continue

            kind = self._detect_source_kind(file_path)
            relative_file_path = _relative_display_path(file_path, resolved_folder_path)
            if kind not in {"text", "code"}:
                non_text_file_count += 1
                if len(non_text_examples) < MAX_TARGET_CONTEXT_NON_TEXT_EXAMPLES:
                    non_text_examples.append(relative_file_path)
                continue

            excerpt, truncated, error_message = self._read_text_excerpt(file_path)
            if error_message:
                warnings.append(
                    f"Failed to read existing target file {target.folder_path}/{relative_file_path}: {error_message}"
                )
                continue
            if not excerpt:
                continue

            size_bytes = 0
            try:
                size_bytes = file_path.stat().st_size
            except OSError:
                pass

            block_lines = [
                f"Existing file: {relative_file_path}",
                f"Kind: {kind}",
                f"Size: {size_bytes} bytes",
            ]
            if truncated:
                block_lines.append(
                    "Note: existing file content was truncated for analysis context."
                )
            block_lines.extend(["", "Content:", excerpt])
            readable_blocks.append("\n".join(block_lines))
            readable_file_count += 1

        folder_text_excerpt = "\n\n---\n\n".join(readable_blocks).strip()
        folder_truncated = False
        if folder_text_excerpt:
            folder_text_excerpt, folder_truncated = _truncate_text(
                folder_text_excerpt,
                MAX_TARGET_CONTEXT_CHARS_PER_FOLDER,
            )

        return (
            TargetFolderContext(
                folder_path=target.folder_path,
                purpose=target.purpose,
                file_count=len(file_paths),
                readable_file_count=readable_file_count,
                skipped_source_file_count=skipped_source_file_count,
                non_text_file_count=non_text_file_count,
                truncated=folder_truncated,
                text_excerpt=folder_text_excerpt,
                non_text_examples=tuple(non_text_examples),
            ),
            warnings,
        )

    def _read_text_excerpt(self, path: Path) -> tuple[str | None, bool, str | None]:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            return None, False, str(exc)

        excerpt, truncated = _truncate_text(content, MAX_TEXT_CHARS_PER_FILE)
        if not excerpt.strip():
            return None, False, None
        return excerpt, truncated, None

    def _build_multimodal_user_content(
        self,
        prepared_sources: list[PreparedSource],
        target_contexts: list[TargetFolderContext],
    ) -> list[dict[str, Any]]:
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    "Extract and organize the useful information from these dropped local files. "
                    "Before analyzing the dropped files, review the existing contents of the "
                    "configured target folders so the result stays consistent with what is "
                    "already saved there. Route the result into the most appropriate configured "
                    "archive folder or folders."
                ),
            }
        ]

        target_context_prompt = _format_target_folder_contexts(target_contexts)
        if target_context_prompt:
            content.append({"type": "text", "text": target_context_prompt})

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

    def _build_text_only_user_prompt(
        self,
        prepared_sources: list[PreparedSource],
        target_contexts: list[TargetFolderContext],
    ) -> str:
        sections = [
            "Extract and organize the useful information from these dropped local files.",
            (
                "Before analyzing the dropped files, review the existing contents of the "
                "configured target folders so the result stays consistent with what is already "
                "saved there."
            ),
            "Route the result into the most appropriate configured archive folder or folders.",
            "",
        ]

        target_context_prompt = _format_target_folder_contexts(target_contexts)
        if target_context_prompt:
            sections.extend([target_context_prompt, "", "---", ""])

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

    def _build_summary(self, result_text: str) -> str:
        for line in result_text.splitlines():
            cleaned = line.strip().lstrip("#").strip()
            cleaned = re.sub(r"^[-*]\s+", "", cleaned)
            cleaned = re.sub(r"^\d+\.\s+", "", cleaned)
            if cleaned:
                return cleaned[:220]
        return result_text.strip()[:220]

    def _build_job_summary(self, batch_summaries: list[str], batch_count: int) -> str:
        unique_summaries: list[str] = []
        for summary in batch_summaries:
            if summary and summary not in unique_summaries:
                unique_summaries.append(summary)

        if batch_count <= 1:
            return unique_summaries[0] if unique_summaries else ""

        summary_prefix = (
            f"Processed the dropped files in {batch_count} queued batches of up to "
            f"{MAX_FILES_PER_BATCH} files."
        )
        preview = " ".join(unique_summaries[:2]).strip()
        if not preview:
            return summary_prefix

        remaining_summary_count = max(0, len(unique_summaries) - 2)
        if remaining_summary_count:
            return (
                f"{summary_prefix} {preview} "
                f"{remaining_summary_count} additional batch summary(s) were recorded."
            )

        return f"{summary_prefix} {preview}"

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
    prompt_path = Path(__file__).resolve().parents[1] / "prompts" / "internal" / "FileIngest.md"
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


def _format_target_folder_contexts(target_contexts: list[TargetFolderContext]) -> str:
    if not target_contexts:
        return ""

    sections = [
        "Existing target folder context is provided below. Use it before analyzing the new dropped files.",
        "",
    ]

    for index, target_context in enumerate(target_contexts, start=1):
        if index > 1:
            sections.extend(["", "====", ""])

        sections.extend(
            [
                f"Target folder: {target_context.folder_path}",
                f"Purpose: {target_context.purpose}",
                f"Existing files found: {target_context.file_count}",
                f"Readable text files loaded as context: {target_context.readable_file_count}",
            ]
        )

        if target_context.skipped_source_file_count:
            sections.append(
                "Dropped files skipped from folder context: "
                f"{target_context.skipped_source_file_count}"
            )
        if target_context.non_text_file_count:
            sections.append(
                "Existing non-text files not expanded into text context: "
                f"{target_context.non_text_file_count}"
            )
            if target_context.non_text_examples:
                sections.append("Examples: " + ", ".join(target_context.non_text_examples))
        if target_context.truncated:
            sections.append("Note: existing folder context was truncated to fit analysis limits.")

        sections.append("")
        if target_context.text_excerpt:
            sections.append("Existing readable file contents:")
            sections.append(target_context.text_excerpt)
        else:
            sections.append("No existing readable text content was found in this folder.")

    return "\n".join(sections).strip()


def _extract_note_suffix_from_purpose(purpose: str) -> str:
    matches = PURPOSE_NOTE_FILENAME_PATTERN.findall(str(purpose or ""))
    for raw_suffix in reversed(matches):
        normalized_note_suffix = normalize_file_ingest_note_suffix(raw_suffix)
        if normalized_note_suffix:
            return normalized_note_suffix
    return ""


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


def _make_path_key(path: Path) -> str:
    try:
        resolved = path.resolve()
    except OSError:
        resolved = path
    return str(resolved).lower()


def _relative_display_path(path: Path, base_path: Path) -> str:
    try:
        return path.relative_to(base_path).as_posix()
    except ValueError:
        return path.name


def _resolve_configured_target_folder(folder_path: str) -> Path:
    normalized_folder_path = normalize_file_ingest_folder_path(folder_path)
    candidate = Path(normalized_folder_path)
    if candidate.is_absolute():
        return candidate.resolve(strict=False)
    return get_file_ingest_root().joinpath(normalized_folder_path)


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
