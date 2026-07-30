import type { CSSProperties } from 'react';
import { theme } from 'antd';
import { CommandConsole } from './features/commands/command-console';

export function App() {
  const { token } = theme.useToken();
  const themeVariables = {
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


