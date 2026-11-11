import { Alert, Button, Input } from 'antd';
import { Send } from 'lucide-react';
import { useSetState } from 'react-use';

interface SelectionAssistantInputProps {
  isBusy: boolean;
  error: string;
  onSubmit: (text: string) => void;
}

export const SelectionAssistantInput = ({ isBusy, error, onSubmit }: SelectionAssistantInputProps) => {
  const [{ text }, setState] = useSetState({ text: '' });
  const submit = () => {
    if (text.trim() && !isBusy) onSubmit(text.trim());
  };

  return (
    <form className="mb-5 flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="flex flex-col gap-5">
        <label htmlFor="selection-assistant-input" className="font-medium">Ask about text</label>
        <Input.TextArea
          id="selection-assistant-input"
          value={text}
          placeholder="Type or paste text for the assistant…"
          autoSize={{ minRows: 3, maxRows: 10 }}
          aria-describedby="selection-assistant-input-help"
          onChange={(event) => setState({ text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-5">
        <span id="selection-assistant-input-help" className="text-sm text-[var(--app-text-secondary)]">
          Ctrl+Enter or ⌘+Enter to submit. Enter adds a new line.
        </span>
        <Button type="primary" htmlType="submit" icon={<Send size={16} />} loading={isBusy} disabled={!text.trim() || isBusy}>
          Ask assistant
        </Button>
      </div>
      {error ? <Alert type="error" showIcon title={error} /> : null}
    </form>
  );
};
