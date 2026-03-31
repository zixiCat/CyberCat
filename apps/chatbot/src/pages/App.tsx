import '../styles.css';

import { ConfigProvider, theme as antdTheme } from 'antd';
import { createContext, useContext, useEffect } from 'react';
import { useSetState } from 'react-use';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { loadBackendJson, waitForBackend, waitForQWebChannel } from './backendShared';
import { ChatView } from './chatView';
import { SettingsView } from './settingsView';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

/**
 * On first load (path "/") check whether the backend has all required
 * settings configured. If not, redirect to /settings; otherwise /chat.
 */
const ConfigRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const backend = await waitForBackend({
        retryDelayMs: 150,
        isCancelled: () => cancelled,
      });

      if (!backend?.get_config_status || cancelled) {
        return;
      }

      try {
        const status = await loadBackendJson<{ configured?: boolean }>(
          () => backend.get_config_status?.(),
          'Config status',
        );

        if (!cancelled) {
          navigate(status.configured ? '/chat' : '/settings', { replace: true });
        }
      } catch {
        if (!cancelled) {
          navigate('/chat', { replace: true });
        }
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return null;
};

// Initialise QWebChannel at app level so window.backend is available on all routes
function useInitQWebChannel() {
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const channelReady = await waitForQWebChannel({ isCancelled: () => cancelled });
      if (!channelReady || window.webChannelInitializing || window.backend) {
        return;
      }

      window.webChannelInitializing = true;

      try {
        window.webChannel = new window.QWebChannel(
          window.qt.webChannelTransport,
          (channel: { objects: { backend: NonNullable<Window['backend']> } }) => {
            window.backend = channel.objects.backend;
            window.webChannelInitializing = false;
          },
        );
      } catch (error) {
        window.webChannelInitializing = false;
        console.error('Error initializing QWebChannel:', error);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, []);
}

export const App = () => {
  const brandPrimary = '#7c3aed';
  const brandPrimaryHover = '#6d28d9';
  const brandPrimaryActive = '#5b21b6';

  useInitQWebChannel();
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  const [themeState, setThemeState] = useSetState({
    theme: ((localStorage.getItem('theme') as ThemeMode) || 'system') as ThemeMode,
    systemTheme: window.matchMedia('(prefers-color-scheme: dark)').matches
      ? ('dark' as const)
      : ('light' as const),
  });
  const { theme, systemTheme } = themeState;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setThemeState({ systemTheme: e.matches ? 'dark' : 'light' });
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [setThemeState]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState({ theme: newTheme });
    localStorage.setItem('theme', newTheme);
  };

  const effectiveTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
    root.style.colorScheme = effectiveTheme;
  }, [effectiveTheme]);

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      <ConfigProvider
        theme={{
          algorithm:
            effectiveTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            borderRadius: 8,
            colorPrimary: brandPrimary,
            colorPrimaryHover: brandPrimaryHover,
            colorPrimaryActive: brandPrimaryActive,
            colorBorder:
              effectiveTheme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
            colorBorderSecondary:
              effectiveTheme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            colorBgLayout: effectiveTheme === 'dark' ? '#0a0a0a' : '#f9fafb',
            colorBgContainer: effectiveTheme === 'dark' ? '#141414' : '#ffffff',
          },
          components: {
            Button: {
              borderRadiusSM: 6,
              colorBorder: 'transparent',
            },
            Segmented: {
              itemSelectedBg: effectiveTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#ffffff',
              trackBg: effectiveTheme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
            },
          },
        }}
      >
        <div
          className={`
            min-h-screen

            ${
              effectiveTheme === 'dark'
                ? 'bg-[#1f1f1f] text-white/90'
                : `bg-gray-50 text-gray-900`
            }

            transition-colors duration-300
          `}
        >
          <Routes location={backgroundLocation || location}>
            <Route path="/chat" element={<ChatView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/" element={<ConfigRedirect />} />
          </Routes>

          {backgroundLocation && location.pathname === '/settings' && <SettingsView />}
        </div>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
