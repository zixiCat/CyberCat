import { create } from 'zustand';

const STORAGE_KEY = 'cybercat-theme';
type ThemeMode = 'light' | 'dark';
type ThemePreference = ThemeMode | 'system';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function resolveMode(preference: ThemePreference): ThemeMode {
  return preference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preference;
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
}

interface ThemeState {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const initialPreference = readPreference();
const initialMode = resolveMode(initialPreference);
applyTheme(initialMode);

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  preference: initialPreference,
  setPreference: (preference) => {
    const mode = resolveMode(preference);
    applyTheme(mode);
    set({ mode, preference });
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // The control still works when browser storage is unavailable.
    }
  },
}));

systemTheme.addEventListener('change', () => {
  if (useThemeStore.getState().preference === 'system') {
    const mode = resolveMode('system');
    applyTheme(mode);
    useThemeStore.setState({ mode });
  }
});
