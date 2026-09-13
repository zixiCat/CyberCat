import type { CSSProperties } from 'react';
import { theme } from 'antd';
import { CommandConsole } from './features/commands/command-console';

export function App() {
  const { token } = theme.useToken();
  const themeVariables = {
    '--app-bg': token.colorBgLayout,
    '--app-surface': token.colorBgContainer,
    '--app-text': token.colorText,
    '--app-text-secondary': token.colorTextSecondary,
    '--app-border': token.colorBorderSecondary,
    '--app-code-bg': token.colorFillTertiary,
    '--app-color-primary': token.colorPrimary,
    '--app-color-primary-bg': token.colorPrimaryBg,
    '--app-color-primary-border': token.colorPrimaryBorder,
    '--app-color-primary-text': token.colorPrimaryText,
  } as CSSProperties;

  return (
    <div className="app-shell" style={themeVariables}>
      <CommandConsole />
    </div>
  );
}

export default App;


