import { useState, useEffect, useRef, useCallback } from 'react';

export interface InactivityState {
  isInactive: boolean;
  activeDanceIndex: 0 | 1 | 2;
  resetTimer: () => void;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointermove',
  'pointerdown',
  'keydown',
  'touchstart',
  'scroll'
];

export function useInactivityTimer(timeoutMs = 15000): InactivityState {
  const [isInactive, setIsInactive] = useState(false);
  const [activeDanceIndex, setActiveDanceIndex] = useState<0 | 1 | 2>(0);

  const isInactiveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (isInactiveRef.current) {
      isInactiveRef.current = false;
      setIsInactive(false);
    }

    timerRef.current = setTimeout(() => {
      isInactiveRef.current = true;
      setIsInactive(true);
      const nextDance = Math.floor(Math.random() * 3) as 0 | 1 | 2;
      setActiveDanceIndex(nextDance);
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    resetTimer();

    const handleActivity = () => {
      resetTimer();
    };

    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimer]);

  return {
    isInactive,
    activeDanceIndex,
    resetTimer
  };
}
