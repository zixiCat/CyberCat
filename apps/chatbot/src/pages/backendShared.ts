import { BackendBridge } from './chatView/types';

const DEFAULT_BACKEND_RETRY_DELAY_MS = 100;

interface WaitForRuntimeOptions {
  retryDelayMs?: number;
  isCancelled?: () => boolean;
}

const sleep = (retryDelayMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, retryDelayMs);
  });

export const waitForBackend = async ({
  retryDelayMs = DEFAULT_BACKEND_RETRY_DELAY_MS,
  isCancelled,
}: WaitForRuntimeOptions = {}): Promise<BackendBridge | null> => {
  while (!isCancelled?.()) {
    if (window.backend) {
      return window.backend;
    }

    await sleep(retryDelayMs);
  }

  return null;
};

export const waitForQWebChannel = async ({
  retryDelayMs = DEFAULT_BACKEND_RETRY_DELAY_MS,
  isCancelled,
}: WaitForRuntimeOptions = {}): Promise<boolean> => {
  while (!isCancelled?.()) {
    if (window.qt?.webChannelTransport && window.QWebChannel) {
      return true;
    }

    await sleep(retryDelayMs);
  }

  return false;
};

export const parseBackendJson = <T>(json: string, label: string): T => {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON payload.';
    throw new Error(`${label}: ${message}`);
  }
};

export const loadBackendJson = async <T>(
  loader: (() => Promise<string> | undefined) | undefined,
  label: string,
): Promise<T> => {
  if (!loader) {
    throw new Error(`${label} backend is not ready.`);
  }

  const result = loader();
  if (!result) {
    throw new Error(`${label} backend is not ready.`);
  }

  return parseBackendJson<T>(await result, label);
};