import { Alert } from 'antd';
import { Archive, FolderInput } from 'lucide-react';

import { useChatUiStore } from './chatUiStore';

const ZERO_COUNT = 0;
const SINGLE_FILE_COUNT = 1;
const FOLDER_PREVIEW_LIMIT = 2;
const PURPOSE_PREVIEW_LIMIT = 180;

const truncateText = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(ZERO_COUNT, maxLength).trimEnd()}...` : value;

export const FileIngestDropPanel = () => {
  const fileIngestEnabled = useChatUiStore((state) => state.fileIngestEnabled);
  const fileIngestTargets = useChatUiStore((state) => state.fileIngestTargets);
  const isFileIngestRunning = useChatUiStore((state) => state.isFileIngestRunning);
  const pendingFileIngestSourceCount = useChatUiStore((state) => state.pendingFileIngestSourceCount);
  const lastFileIngestResult = useChatUiStore((state) => state.lastFileIngestResult);

  if (!fileIngestEnabled) {
    return null;
  }

  const configuredFolders = fileIngestTargets
    .map((target) => target.folderPath.trim())
    .filter(Boolean);
  const folderPreview = configuredFolders.slice(ZERO_COUNT, FOLDER_PREVIEW_LIMIT).join(', ');
  const folderOverflow =
    configuredFolders.length > FOLDER_PREVIEW_LIMIT
      ? `, +${configuredFolders.length - FOLDER_PREVIEW_LIMIT} more`
      : '';
  const purposePreview = truncateText(
    fileIngestTargets
      .filter((target) => target.folderPath.trim())
      .map((target) => `${target.folderPath.trim()}: ${target.purpose.trim()}`)
      .join(' | '),
    PURPOSE_PREVIEW_LIMIT,
  );
  const updatedNotes = lastFileIngestResult?.outputs
    ?.map((output) => output.noteRelativePath)
    .filter(Boolean)
    .join(', ');
  const resultDescription = lastFileIngestResult?.ok
    ? [
        lastFileIngestResult.summary || 'AI-organized content was routed into the configured archive folders.',
        lastFileIngestResult.collectedAt
          ? `Collected at ${lastFileIngestResult.collectedAt}.`
          : null,
        updatedNotes ? `Updated notes: ${updatedNotes}.` : null,
        lastFileIngestResult.warnings?.length
          ? `${lastFileIngestResult.warnings.length} warning(s) were recorded.`
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    : lastFileIngestResult?.error || 'Failed to process the dropped files.';

  return (
    <div className="
      mb-3 rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-3

      dark:border-emerald-400/20 dark:bg-emerald-500/10
    ">
      <div className="flex items-start gap-3">
        <div className="
          mt-0.5 rounded-lg bg-white/80 p-2 text-emerald-700 shadow-xs

          dark:bg-black/20 dark:text-emerald-100
        ">
          {isFileIngestRunning ? <Archive size={16} /> : <FolderInput size={16} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="
            text-sm font-semibold text-emerald-900

            dark:text-emerald-50
          ">
            {isFileIngestRunning
              ? `Processing ${pendingFileIngestSourceCount || SINGLE_FILE_COUNT} dropped file(s)`
              : 'Drop files into the CyberCat window'}
          </div>

          <p className="
            mt-1 text-xs/relaxed text-emerald-800/90

            dark:text-emerald-100/80
          ">
            CyberCat will organize the extracted content and route it into the best matching
            configured folder, using relative paths under output/file_ingest/ or any absolute path you configured.
          </p>

          <p className="
            mt-2 text-xs/relaxed text-emerald-900/80

            dark:text-emerald-50/70
          ">
            {configuredFolders.length
              ? `Configured folders: ${folderPreview}${folderOverflow}.`
              : 'Add at least one folder target in Settings > File Ingest.'}
          </p>

          <p className="
            mt-2 text-xs/relaxed text-emerald-900/80

            dark:text-emerald-50/70
          ">
            {purposePreview || 'Set folder purposes in Settings > File Ingest to guide classification and restructuring.'}
          </p>
        </div>
      </div>

      {!isFileIngestRunning && lastFileIngestResult && (
        <Alert
          className="mt-3"
          type={lastFileIngestResult.ok ? 'success' : 'error'}
          showIcon
          message={
            lastFileIngestResult.ok
              ? `Collected ${lastFileIngestResult.sourceCount || ZERO_COUNT} file(s) into ${lastFileIngestResult.outputCount || lastFileIngestResult.outputs?.length || ZERO_COUNT} archive destination(s).`
              : 'File ingest failed.'
          }
          description={resultDescription}
        />
      )}
    </div>
  );
};
