import { Switch } from 'antd';
import { Moon } from 'lucide-react';
import { useThemeStore } from '../theme-store';

export function ThemeToggle() {
  const { mode, setMode } = useThemeStore();

  return (
    <div className="flex justify-between items-center gap-2">
      <Moon size={16} aria-hidden="true" />
      <Switch
        id="dark-mode"
        size='small'
        checked={mode === 'dark'}
        onChange={(checked) => setMode(checked ? 'dark' : 'light')}
      />
    </div>
  );
}
