import { Alert } from 'antd';
import { Archive, FolderInput, Upload } from 'lucide-react';
import { useSetState } from 'react-use';

import { loadBackendJson } from '../backendShared';
import { useChatUiStore } from './chatUiStore';
import { FileIngestPickerResult, FileIngestStartResult } from './types';

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
  const setUiState = useChatUiStore((state) => state.setUiState);
  const [{ isPickerOpen }, setState] = useSetState({ isPickerOpen: false });

  if (!fileIngestEnabled) {
    return null;
  }

  const canUploadFiles = Boolean(
    window.backend?.pick_file_ingest_paths && window.backend?.start_file_ingest,
  );

  const setFileIngestError = (error: string, jobId = '') => {
    setUiState({
      isFileIngestRunning: false,
      pendingFileIngestSourceCount: 0,
      lastFileIngestResult: {
        ok: false,
        jobId,
        error,
      },
    });
  };

  const handleUploadFiles = async () => {
    if (isFileIngestRunning || isPickerOpen || !canUploadFiles) {
      return;
    }

    setState({ isPickerOpen: true });
    try {
      const selection = await loadBackendJson<FileIngestPickerResult>(
        () => window.backend?.pick_file_ingest_paths?.(),
        'File ingest picker',
      );
      if (!selection.ok) {
        if (selection.cancelled) {
          return;
        }

        setFileIngestError(selection.error || 'Failed to select files for ingest.');
        return;
      }

      if (!selection.paths?.length) {
        return;
      }

      const startResult = await loadBackendJson<FileIngestStartResult>(
        () => window.backend?.start_file_ingest?.(JSON.stringify(selection.paths)),
        'File ingest start',
      );
      if (!startResult.ok) {
        setFileIngestError(
          startResult.error || 'Failed to start file ingest.',
          startResult.jobId || '',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload files.';
      console.error('Failed to upload files into CyberCat:', error);
      setFileIngestError(message);
    } finally {
      setState({ isPickerOpen: false });
    }
  };

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
        updatedNotes ? `Updated files: ${updatedNotes}.` : null,
        lastFileIngestResult.warnings?.length
          ? `${lastFileIngestResult.warnings.length} warning(s) were recorded.`
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    : lastFileIngestResult?.error || 'Failed to process the selected files.';
  const triggerLabel = isPickerOpen ? 'Opening...' : 'Upload files';

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
          <div className="flex items-start justify-between gap-3">
            <div className="
              text-sm font-semibold text-emerald-900

              dark:text-emerald-50
            ">
              {isFileIngestRunning
                ? `Processing ${pendingFileIngestSourceCount || SINGLE_FILE_COUNT} file(s)`
                : 'Drop or upload files here'}
            </div>

            <button
              type="button"
              onClick={() => {
                void handleUploadFiles();
              }}
              disabled={isFileIngestRunning || isPickerOpen || !canUploadFiles}
              title={
                canUploadFiles ? 'Choose local files to ingest' : 'File upload is unavailable.'
              }
              className="
                inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border
                border-emerald-200/80 bg-white/80 px-3 text-[11px] font-semibold tracking-[0.08em]
                text-emerald-800 uppercase shadow-xs transition-all duration-150

                hover:border-emerald-300/90 hover:bg-white hover:text-emerald-900

                active:scale-95

                disabled:cursor-not-allowed disabled:opacity-50

                dark:border-emerald-300/20 dark:bg-black/15 dark:text-emerald-100

                dark:hover:border-emerald-200/30 dark:hover:bg-black/25
              "
            >
              <Upload size={13} />
              <span>{triggerLabel}</span>
            </button>
          </div>

          <p className="
            mt-1 text-xs/relaxed text-emerald-800/90

            dark:text-emerald-100/80
          ">
            CyberCat will organize the extracted content, route it into the best matching
            configured folder, and save it into date-based markdown files under output/file_ingest/
            or any absolute path you configured. You can drag files into the window or upload them
            here. Large drops are queued and processed in batches of 10 files.
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
            {purposePreview || 'Set folder purposes in Settings > File Ingest to guide classification, filename suffixes, and saved format.'}
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
