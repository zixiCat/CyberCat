import { Input, Select, Switch } from 'antd';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

import { SettingsField, SettingsValue } from './settingsFields';

interface SettingsFieldListProps {
  fields: SettingsField[];
  values: Record<string, SettingsValue>;
  revealedKeys: Set<string>;
  onValueChange: (key: string, value: SettingsValue) => void;
  onToggleReveal: (key: string) => void;
  showLeadingIcon?: boolean;
  showRequiredMarker?: boolean;
  controlSize?: 'large';
}

const getStringValue = (values: Record<string, SettingsValue>, key: string) =>
  (typeof values[key] === 'string' ? values[key] : '');

const getBooleanValue = (values: Record<string, SettingsValue>, key: string) =>
  Boolean(values[key]);

export const SettingsFieldList = ({
  fields,
  values,
  revealedKeys,
  onValueChange,
  onToggleReveal,
  showLeadingIcon = false,
  showRequiredMarker = false,
  controlSize,
}: SettingsFieldListProps) => (
  <div className="flex flex-col gap-6">
    {fields.map((field) => (
      <div key={field.key}>
        <label
          className={
            showLeadingIcon
              ? `
                mb-2 flex items-center gap-2 text-sm font-medium text-zinc-600

                dark:text-zinc-300
              `
              : `
                mb-2 block text-sm font-medium text-zinc-600

                dark:text-zinc-300
              `
          }
        >
          {showLeadingIcon && <KeyRound size={14} />}
          {field.label}
          {showRequiredMarker && field.required && <span className="ml-1 text-red-400">*</span>}
        </label>
        {field.control === 'switch' ? (
          <div className="flex items-center gap-3">
            <Switch
              checked={getBooleanValue(values, field.key)}
              onChange={(checked) => onValueChange(field.key, checked)}
            />
            <span
              className="
                text-sm text-zinc-500

                dark:text-zinc-400
              "
            >
              {getBooleanValue(values, field.key) ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        ) : field.multiline ? (
          <Input.TextArea
            rows={field.rows}
            value={getStringValue(values, field.key)}
            onChange={(event) => onValueChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            autoComplete="off"
          />
        ) : field.options ? (
          <Select
            size={controlSize}
            className="w-full"
            value={getStringValue(values, field.key) || undefined}
            onChange={(value) => onValueChange(field.key, value)}
            options={field.options}
            placeholder={field.placeholder}
          />
        ) : (
          <Input
            size={controlSize}
            value={getStringValue(values, field.key)}
            onChange={(event) => onValueChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            type={field.secret && !revealedKeys.has(field.key) ? 'password' : 'text'}
            autoComplete="off"
            suffix={
              field.secret ? (
                <button
                  type="button"
                  onClick={() => onToggleReveal(field.key)}
                  className="
                    cursor-pointer border-none bg-transparent p-0 text-zinc-400

                    hover:text-zinc-600

                    dark:hover:text-zinc-300
                  "
                >
                  {revealedKeys.has(field.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              ) : undefined
            }
          />
        )}
        {field.description && (
          <span
            className="
              mt-2 block text-xs text-zinc-500

              dark:text-zinc-400
            "
          >
            {field.description}
          </span>
        )}
      </div>
    ))}
  </div>
);