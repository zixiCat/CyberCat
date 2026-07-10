import { UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi';

export type Hotkey = {
  shortcut: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  keycode: number;
};

const normalizeToken = (value: string): string => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return '';
  }

  if (/^digit\d$/i.test(trimmedValue)) {
    return trimmedValue.slice(-1);
  }

  if (/^key[A-Z]$/i.test(trimmedValue)) {
    return trimmedValue.slice(-1).toUpperCase();
  }

  return trimmedValue;
};

const resolveKeycode = (token: string): number | null => {
  const normalizedToken = normalizeToken(token);
  const keyEntries = Object.entries(UiohookKey) as Array<[string, number]>;
  const matchedEntry = keyEntries.find(([keyName]) => keyName.toLowerCase() === normalizedToken.toLowerCase());

  if (!matchedEntry) {
    return null;
  }

  return matchedEntry[1];
};

export const parseHotkey = (shortcut: string): Hotkey => {
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('Shortcut cannot be empty.');
  }

  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;
  let keycode: number | null = null;

  for (const token of tokens) {
    const normalizedToken = token.trim().toLowerCase();

    if (normalizedToken === 'ctrl' || normalizedToken === 'control') {
      ctrl = true;
      continue;
    }

    if (normalizedToken === 'alt' || normalizedToken === 'option') {
      alt = true;
      continue;
    }

    if (normalizedToken === 'shift') {
      shift = true;
      continue;
    }

    if (
      normalizedToken === 'cmd'
      || normalizedToken === 'command'
      || normalizedToken === 'meta'
      || normalizedToken === 'win'
      || normalizedToken === 'windows'
    ) {
      meta = true;
      continue;
    }

    if (keycode !== null) {
      throw new Error(`Shortcut must contain exactly one non-modifier key: ${shortcut}`);
    }

    keycode = resolveKeycode(token);

    if (keycode === null) {
      throw new Error(`Shortcut contains an unsupported key token: ${token}`);
    }
  }

  if (keycode === null) {
    throw new Error(`Shortcut is missing a non-modifier key: ${shortcut}`);
  }

  return {
    shortcut,
    ctrl,
    alt,
    shift,
    meta,
    keycode,
  };
};

export const matchesHotkey = (hotkey: Hotkey, event: UiohookKeyboardEvent): boolean =>
  event.keycode === hotkey.keycode
  && event.ctrlKey === hotkey.ctrl
  && event.altKey === hotkey.alt
  && event.shiftKey === hotkey.shift
  && event.metaKey === hotkey.meta;