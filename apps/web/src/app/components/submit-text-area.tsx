import { Input } from 'antd';
import type { TextAreaProps } from 'antd/es/input/TextArea';
import { handleTextSubmitKey } from './text-submit-key';

export const textSubmitHint = 'Enter to send. Ctrl+Enter or ⌘+Enter to add a new line.';

interface SubmitTextAreaProps extends Omit<TextAreaProps, 'value' | 'defaultValue' | 'onChange' | 'onKeyDown' | 'onPressEnter'> {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
}

export const SubmitTextArea = ({ value, onValueChange, onSubmit, submitDisabled, ...props }: SubmitTextAreaProps) => (
  <Input.TextArea
    {...props}
    value={value}
    onChange={(event) => onValueChange(event.target.value)}
    onKeyDown={(event) => {
      if (props.disabled || props.readOnly) return;
      const input = event.currentTarget;
      const caret = handleTextSubmitKey(event, { onSubmit, onValueChange, submitDisabled });
      if (caret !== undefined) {
        requestAnimationFrame(() => {
          if (input.isConnected) input.setSelectionRange(caret, caret);
        });
      }
    }}
  />
);
