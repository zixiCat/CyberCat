import { StrictMode } from 'react';
import { ConfigProvider } from 'antd';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/app';
import { useThemeStore } from './app/theme-store';
import { getBrandTheme } from './brand-theme';

function ThemedApp() {
  const mode = useThemeStore((state) => state.mode);
  return (
    <ConfigProvider theme={getBrandTheme(mode)}>
      <BrowserRouter><App /></BrowserRouter>
    </ConfigProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<StrictMode><ThemedApp /></StrictMode>);
