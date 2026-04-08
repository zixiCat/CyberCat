import { useEffect, useRef } from 'react';
import { useSetState } from 'react-use';

const HOLD_PROGRESS_EMPTY = 0;
const HOLD_PROGRESS_COMPLETE = 1;

interface DeleteHoldState {
  progress: number;
}

interface UseDeleteHoldButtonOptions {
  durationMs: number;
  tickMs: number;
  disabled?: boolean;
  onComplete: () => Promise<void>;
}

export const useDeleteHoldButton = ({
  durationMs,
  tickMs,
  disabled = false,
  onComplete,
}: UseDeleteHoldButtonOptions) => {
  const [state, setState] = useSetState<DeleteHoldState>({
    progress: HOLD_PROGRESS_EMPTY,
  });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setState({ progress: HOLD_PROGRESS_EMPTY });
  };

  const start = () => {
    if (disabled || timerRef.current !== null) {
      return;
    }

    const holdStartedAt = Date.now();
    setState({ progress: HOLD_PROGRESS_EMPTY });

    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - holdStartedAt;
      const nextProgress = Math.min(elapsed / durationMs, HOLD_PROGRESS_COMPLETE);

      setState({ progress: nextProgress });

      if (nextProgress < HOLD_PROGRESS_COMPLETE) {
        return;
      }

      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }

      void onComplete().finally(() => {
        setState({ progress: HOLD_PROGRESS_EMPTY });
      });
    }, tickMs);
  };

  return {
    progress: state.progress,
    start,
    cancel,
  };
};
