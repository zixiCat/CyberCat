import { create } from 'zustand';

const STORAGE_KEY = 'cybercat-theme';
type ThemeMode = 'light' | 'dark';

function readTheme(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const initialMode = readTheme();
applyTheme(initialMode);

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  setMode: (mode) => {
    applyTheme(mode);
    set({ mode });
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // The control still works when browser storage is unavailable.
    }
  },
}));
