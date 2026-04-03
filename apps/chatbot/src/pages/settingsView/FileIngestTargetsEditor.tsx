import { Alert, Button, Input } from 'antd';
import { FolderPlus, Trash2 } from 'lucide-react';

import {
  createDefaultFileIngestTarget,
  createFileIngestTarget,
  parseEditableFileIngestTargets,
  serializeFileIngestTargets,
} from '../fileIngestTargets';

interface FileIngestTargetsEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
}

export const FileIngestTargetsEditor = ({ value, onChange }: FileIngestTargetsEditorProps) => {
  const targets = parseEditableFileIngestTargets(value);

  const updateTargets = (nextTargets = targets) => {
    onChange(serializeFileIngestTargets(nextTargets));
  };

  const updateTarget = (targetId: string, patch: { folderPath?: string; purpose?: string }) => {
    updateTargets(
      targets.map((target) => (target.id === targetId ? { ...target, ...patch } : target)),
    );
  };

  const addTarget = () => {
    updateTargets([...targets, createFileIngestTarget()]);
  };

  const removeTarget = (targetId: string) => {
    const nextTargets = targets.filter((target) => target.id !== targetId);
    updateTargets(nextTargets.length ? nextTargets : [createDefaultFileIngestTarget()]);
  };

  return (
    <div className="flex flex-col gap-5">
      <Alert
        type="info"
        showIcon
        message="Folder paths can be relative or absolute."
        description="Relative paths are resolved under output/file_ingest/. Absolute paths can point anywhere on your machine, for example a OneDrive folder. Saved files use a date-based markdown name, and the folder purpose can request a suffix like yyyy-mm-dd_sentence.md."
      />

      <div className="grid gap-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-5 lg:grid-cols-2 dark:border-white/10 dark:bg-zinc-900/60">
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Path Rule</p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Relative paths are created under output/file_ingest/. Absolute paths can point to
            places like OneDrive or other local folders.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Purpose Guide</p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Describe what belongs in each folder and the exact saved structure when needed. For
            example: only keep spoken-English practice sentences, save as yyyy-mm-dd_sentence.md,
            and output only bullet lines.
          </p>
        </div>
      </div>

      {targets.map((target, index) => (
        <div
          key={target.id}
          className="rounded-2xl border border-zinc-200/80 bg-white/80 p-5 dark:border-white/10 dark:bg-zinc-950"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">
                Folder {index + 1}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {target.folderPath.trim() || 'New folder target'}
              </p>
            </div>

            <Button
              type="text"
              danger
              icon={<Trash2 size={14} />}
              onClick={() => removeTarget(target.id)}
              aria-label={`Remove file ingest folder ${index + 1}`}
            >
              Remove
            </Button>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Folder Path
              </label>
              <Input
                size="large"
                value={target.folderPath}
                onChange={(event) => updateTarget(target.id, { folderPath: event.target.value })}
                placeholder="C:/Users/zixic/OneDrive/English"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
                Folder Purpose
              </label>
              <Input.TextArea
                rows={4}
                value={target.purpose}
                onChange={(event) => updateTarget(target.id, { purpose: event.target.value })}
                placeholder="Describe what belongs here and, if needed, the exact save format such as yyyy-mm-dd_sentence.md with bullet-only lines."
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      ))}

      <div>
        <Button icon={<FolderPlus size={14} />} onClick={addTarget}>
          Add Folder Target
        </Button>
      </div>
    </div>
  );
};