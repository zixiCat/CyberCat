import type { KeyboardEvent } from 'react';

interface TextSubmitOptions {
  onSubmit: () => void;
  onValueChange: (value: string) => void;
  submitDisabled?: boolean;
}

// Return the new caret position only when a line break was inserted.
export const handleTextSubmitKey = (
  event: KeyboardEvent<HTMLTextAreaElement>,
  { onSubmit, onValueChange, submitDisabled }: TextSubmitOptions,
): number | undefined => {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
    return undefined;
  }
  if (!event.ctrlKey && !event.metaKey && (event.shiftKey || event.altKey)) {
    return undefined;
  }
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const { value, selectionStart, selectionEnd, maxLength } = event.currentTarget;
    const next = `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`;
    if (maxLength >= 0 && next.length > maxLength) {
      return undefined;
    }
    onValueChange(next);
    return selectionStart + 1;
  }
  if (!event.repeat && !submitDisabled) {
    onSubmit();
  }
  return undefined;
};
