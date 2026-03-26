import { useEffectEvent } from 'react';
import { useMount, useUnmount } from 'react-use';

interface UseDesktopMessageInputFocusOptions {
  inputId: string;
  createNewSession: () => void;
}

export const useDesktopMessageInputFocus = ({
  inputId,
  createNewSession,
}: UseDesktopMessageInputFocusOptions) => {
  const focusMessageInput = useEffectEvent(() => {
    const messageInput = document.getElementById(inputId) as HTMLTextAreaElement | null;
    if (!messageInput || messageInput.disabled) {
      return;
    }

    window.requestAnimationFrame(() => {
      messageInput.focus({ preventScroll: true });
      const cursorPosition = messageInput.value.length;
      messageInput.setSelectionRange(cursorPosition, cursorPosition);
    });
  });

  const focusMessageInputSoon = useEffectEvent(() => {
    window.setTimeout(() => {
      focusMessageInput();
    }, 0);
  });

  const handleWindowActivated = useEffectEvent(() => {
    if (!window.qt?.webChannelTransport) {
      return;
    }

    focusMessageInputSoon();
  });

  const handleVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === 'visible') {
      handleWindowActivated();
    }
  });

  const handleNewSessionShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!window.qt?.webChannelTransport) {
      return;
    }

    if (!event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }

    if (event.key.toLowerCase() !== 'l') {
      return;
    }

    event.preventDefault();
    createNewSession();
    focusMessageInputSoon();
  });

  useMount(() => {
    window.addEventListener('focus', handleWindowActivated);
    window.addEventListener('keydown', handleNewSessionShortcut);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    handleWindowActivated();
  });

  useUnmount(() => {
    window.removeEventListener('focus', handleWindowActivated);
    window.removeEventListener('keydown', handleNewSessionShortcut);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return { focusMessageInputSoon };
};