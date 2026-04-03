export interface FileIngestTarget {
  id: string;
  folderPath: string;
  purpose: string;
}

export const DEFAULT_FILE_INGEST_FOLDER = 'inbox';
export const DEFAULT_FILE_INGEST_PURPOSE =
  'General knowledge inbox. Route dropped material here when it does not fit a more specific archive folder.';

const createTargetId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `file-ingest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createFileIngestTarget = (
  overrides: Partial<FileIngestTarget> = {},
): FileIngestTarget => ({
  id: overrides.id || createTargetId(),
  folderPath: overrides.folderPath ?? '',
  purpose: overrides.purpose ?? '',
});

export const createDefaultFileIngestTarget = () =>
  createFileIngestTarget({
    folderPath: DEFAULT_FILE_INGEST_FOLDER,
    purpose: DEFAULT_FILE_INGEST_PURPOSE,
  });

export const getDefaultFileIngestTargets = () => [createDefaultFileIngestTarget()];

const parseTargetsPayload = (rawValue: string | boolean | undefined) => {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return [];
  }

  try {
    const payload = JSON.parse(rawValue);
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
};

export const parseEditableFileIngestTargets = (rawValue: string | boolean | undefined) => {
  const payload = parseTargetsPayload(rawValue);
  const targets = payload
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) =>
      createFileIngestTarget({
        id: typeof item.id === 'string' && item.id.trim() ? item.id : undefined,
        folderPath: typeof item.folderPath === 'string' ? item.folderPath : '',
        purpose: typeof item.purpose === 'string' ? item.purpose : '',
      }),
    );

  return targets.length ? targets : getDefaultFileIngestTargets();
};

export const parseConfiguredFileIngestTargets = (rawValue: string | boolean | undefined) => {
  const payload = parseTargetsPayload(rawValue);
  const seenFolders = new Set<string>();
  const configuredTargets = payload
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : createTargetId(),
      folderPath: typeof item.folderPath === 'string' ? item.folderPath.trim() : '',
      purpose: typeof item.purpose === 'string' ? item.purpose.trim() : '',
    }))
    .filter((target) => {
      if (!target.folderPath) {
        return false;
      }

      const dedupeKey = target.folderPath.toLowerCase();
      if (seenFolders.has(dedupeKey)) {
        return false;
      }

      seenFolders.add(dedupeKey);
      return true;
    })
    .map((target) => ({
      ...target,
      purpose: target.purpose || DEFAULT_FILE_INGEST_PURPOSE,
    }));

  return configuredTargets.length ? configuredTargets : getDefaultFileIngestTargets();
};

export const serializeFileIngestTargets = (targets: FileIngestTarget[]) =>
  JSON.stringify(
    targets.map((target) => ({
      id: target.id,
      folderPath: target.folderPath,
      purpose: target.purpose,
    })),
  );