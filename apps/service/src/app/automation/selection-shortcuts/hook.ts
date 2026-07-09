import { uIOhook, type UiohookKeyboardEvent } from 'uiohook-napi';

type KeydownListener = (event: UiohookKeyboardEvent) => Promise<void> | void;

const listeners = new Set<KeydownListener>();
let isStarted = false;

const dispatchKeydown = (event: UiohookKeyboardEvent) => {
  for (const listener of listeners) {
    void Promise.resolve(listener(event)).catch(() => undefined);
  }
};

const startKeyboardHook = () => {
  if (isStarted) {
    return;
  }

  uIOhook.on('keydown', dispatchKeydown);

  try {
    uIOhook.start();
    isStarted = true;
  } catch (err) {
    uIOhook.off('keydown', dispatchKeydown);
    throw err;
  }
};

const stopKeyboardHook = () => {
  if (!isStarted) {
    return;
  }

  uIOhook.off('keydown', dispatchKeydown);

  try {
    uIOhook.stop();
  } finally {
    isStarted = false;
  }
};

export const registerGlobalKeydownListener = (listener: KeydownListener): (() => void) => {
  startKeyboardHook();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      stopKeyboardHook();
    }
  };
};