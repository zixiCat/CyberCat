import { Alert, Button, Input } from 'antd';
import { Plus, Trash2 } from 'lucide-react';

interface EditableCustomPrompt {
  id: string;
  name: string;
  content: string;
}

interface ParsedCustomPromptsResult {
  prompts: EditableCustomPrompt[];
  parseError: string | null;
}

interface CustomPromptsEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
}

const DEFAULT_PROMPT_NAME_PREFIX = 'Custom Prompt';
const DEFAULT_PROMPT_ROWS = 10;

const generateCustomPromptId = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return `custom-${randomUuid.replace(/-/g, '').slice(0, 8)}`;
  }

  return `custom-${Math.random().toString(16).slice(2, 10)}`;
};

const createCustomPrompt = (index: number): EditableCustomPrompt => ({
  id: generateCustomPromptId(),
  name: `${DEFAULT_PROMPT_NAME_PREFIX} ${index}`,
  content: '',
});

const parseEditableCustomPrompts = (value: string): ParsedCustomPromptsResult => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return { prompts: [], parseError: null };
  }

  try {
    const payload = JSON.parse(trimmedValue);
    if (!Array.isArray(payload)) {
      return { prompts: [], parseError: 'Saved custom prompts are not a list.' };
    }

    return {
      prompts: payload
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item, index) => ({
          id:
            typeof item.id === 'string' && item.id.trim()
              ? item.id
              : createCustomPrompt(index + 1).id,
          name:
            typeof item.name === 'string' && item.name.trim()
              ? item.name
              : `${DEFAULT_PROMPT_NAME_PREFIX} ${index + 1}`,
          content: typeof item.content === 'string' ? item.content : '',
        })),
      parseError: null,
    };
  } catch {
    return {
      prompts: [],
      parseError:
        'Saved custom prompts could not be parsed. Add or save prompts to replace the invalid value.',
    };
  }
};

const serializeCustomPrompts = (prompts: EditableCustomPrompt[]) => JSON.stringify(prompts);

export const CustomPromptsEditor = ({ value, onChange }: CustomPromptsEditorProps) => {
  const { prompts, parseError } = parseEditableCustomPrompts(value);

  const updatePrompts = (nextPrompts = prompts) => {
    onChange(serializeCustomPrompts(nextPrompts));
  };

  const updatePrompt = (
    promptId: string,
    patch: Partial<Pick<EditableCustomPrompt, 'name' | 'content'>>,
  ) => {
    updatePrompts(
      prompts.map((prompt) => (prompt.id === promptId ? { ...prompt, ...patch } : prompt)),
    );
  };

  const addPrompt = () => {
    updatePrompts([...prompts, createCustomPrompt(prompts.length + 1)]);
  };

  const removePrompt = (promptId: string) => {
    updatePrompts(prompts.filter((prompt) => prompt.id !== promptId));
  };

  return (
    <div className="flex flex-col gap-5">
      <Alert
        type="info"
        showIcon
        message="Custom prompts are saved per settings profile."
        description="Each saved prompt appears in the chat header prompt picker. Use this list only for reusable chat system prompts."
      />

      {parseError && <Alert type="error" showIcon message={parseError} />}

      {prompts.length ? (
        prompts.map((prompt, index) => (
          <div
            key={prompt.id}
            className="
              rounded-2xl border border-zinc-200/80 bg-white/80 p-5

              dark:border-white/10 dark:bg-zinc-950
            "
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="
                  text-[11px] font-semibold tracking-[0.12em] text-zinc-500 uppercase

                  dark:text-zinc-400
                ">
                  Prompt {index + 1}
                </p>
                <p className="
                  mt-1 text-sm text-zinc-500

                  dark:text-zinc-400
                ">
                  {prompt.name.trim() || `${DEFAULT_PROMPT_NAME_PREFIX} ${index + 1}`}
                </p>
              </div>

              <Button
                type="text"
                danger
                icon={<Trash2 size={14} />}
                onClick={() => removePrompt(prompt.id)}
                aria-label={`Remove custom prompt ${index + 1}`}
              >
                Remove
              </Button>
            </div>

            <div className="mt-5 grid gap-5">
              <div>
                <label className="
                  mb-2 block text-sm font-medium text-zinc-600

                  dark:text-zinc-300
                ">
                  Prompt Name
                </label>
                <Input
                  size="large"
                  value={prompt.name}
                  onChange={(event) => updatePrompt(prompt.id, { name: event.target.value })}
                  placeholder="Travel Coach"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="
                  mb-2 block text-sm font-medium text-zinc-600

                  dark:text-zinc-300
                ">
                  Prompt Content
                </label>
                <Input.TextArea
                  rows={DEFAULT_PROMPT_ROWS}
                  value={prompt.content}
                  onChange={(event) => updatePrompt(prompt.id, { content: event.target.value })}
                  placeholder="Write the system prompt that should be sent when this custom preset is selected in chat."
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="
          rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-5

          dark:border-white/10 dark:bg-zinc-900/60
        ">
          <p className="
            text-sm font-medium text-zinc-700

            dark:text-zinc-200
          ">
            No custom prompts yet
          </p>
          <p className="
            mt-2 text-sm text-zinc-500

            dark:text-zinc-400
          ">
            Add one or more reusable prompts here, then select them from the chat header.
          </p>
        </div>
      )}

      <div>
        <Button icon={<Plus size={14} />} onClick={addPrompt}>
          Add Custom Prompt
        </Button>
      </div>
    </div>
  );
};