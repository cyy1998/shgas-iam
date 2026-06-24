import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_COUNTDOWN_SECONDS = 60;

export function useSmsCodeCountdown() {
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const resetCountdown = useCallback(() => {
    clearTimer();
    setCountdown(0);
  }, [clearTimer]);

  const startCountdown = useCallback(
    (seconds = DEFAULT_COUNTDOWN_SECONDS) => {
      clearTimer();

      if (seconds <= 0) {
        setCountdown(0);
        return;
      }

      setCountdown(seconds);
      timerRef.current = setInterval(() => {
        setCountdown((value) => {
          if (value <= 1) {
            clearTimer();
            return 0;
          }
          return value - 1;
        });
      }, 1000);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return {
    countdown,
    isCounting: countdown > 0,
    startCountdown,
    resetCountdown,
  };
}
