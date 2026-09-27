import { Select } from 'antd';
import { Moon } from 'lucide-react';
import { useThemeStore } from '../theme-store';

export function ThemeToggle() {
  const { preference, setPreference } = useThemeStore();

  return (
    <div className="flex justify-between items-center gap-2">
      <Moon size={16} aria-hidden="true" />
      <Select
        aria-label="Theme"
        size="small"
        value={preference}
        onChange={setPreference}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </div>
  );
}
