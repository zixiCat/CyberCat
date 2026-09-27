import { Select } from 'antd';
import { useThemeStore } from '../theme-store';

export function ThemeToggle() {
  const { preference, setPreference } = useThemeStore();

  return (
    <div className="flex justify-between items-center gap-2">
      <Select
        aria-label="Theme"
        size="small"
        variant="borderless"
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
