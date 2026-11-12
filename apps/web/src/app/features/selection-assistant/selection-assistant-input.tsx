import { Alert, Button } from 'antd';
import { Send } from 'lucide-react';
import { useSetState } from 'react-use';
import { SubmitTextArea, textSubmitHint } from '../../components/submit-text-area';

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
        <SubmitTextArea
          id="selection-assistant-input"
          value={text}
          placeholder="Type or paste text for the assistant…"
          autoSize={{ minRows: 3, maxRows: 10 }}
          aria-describedby="selection-assistant-input-help"
          onValueChange={(text) => setState({ text })}
          onSubmit={submit}
          submitDisabled={isBusy || !text.trim()}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-5">
        <span id="selection-assistant-input-help" className="text-sm text-[var(--app-text-secondary)]">
          {textSubmitHint}
        </span>
        <Button type="primary" htmlType="submit" icon={<Send size={16} />} loading={isBusy} disabled={!text.trim() || isBusy}>
          Ask assistant
        </Button>
      </div>
      {error ? <Alert type="error" showIcon title={error} /> : null}
    </form>
  );
};
