import { StrictMode } from 'react';
import { ConfigProvider, theme } from 'antd';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/app';
import { useThemeStore } from './app/theme-store';

function ThemedApp() {
  const mode = useThemeStore((state) => state.mode);
  return (
    <ConfigProvider theme={{
      cssVar: {},
      algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: { colorPrimary: '#b26ce8' },
    }}>
      <BrowserRouter><App /></BrowserRouter>
    </ConfigProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<StrictMode><ThemedApp /></StrictMode>);
