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

export function useInactivityTimer(timeoutMs = 5000): InactivityState {
  const [isInactive, setIsInactive] = useState(false);
  const [activeDanceIndex, setActiveDanceIndex] = useState<0 | 1 | 2>(0);

  const isInactiveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const danceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (danceIntervalRef.current) {
      clearInterval(danceIntervalRef.current);
      danceIntervalRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    clearTimers();

    if (isInactiveRef.current) {
      isInactiveRef.current = false;
      setIsInactive(false);
    }

    timerRef.current = setTimeout(() => {
      isInactiveRef.current = true;
      setIsInactive(true);
      const nextDance = Math.floor(Math.random() * 3) as 0 | 1 | 2;
      setActiveDanceIndex(nextDance);

      // Periodically rotate dances while user remains waiting
      danceIntervalRef.current = setInterval(() => {
        if (isInactiveRef.current) {
          setActiveDanceIndex(prev => ((prev + 1) % 3) as 0 | 1 | 2);
        }
      }, 4000);
    }, timeoutMs);
  }, [timeoutMs, clearTimers]);

  useEffect(() => {
    resetTimer();

    const handleActivity = () => {
      resetTimer();
    };

    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimer, clearTimers]);

  return {
    isInactive,
    activeDanceIndex,
    resetTimer
  };
}
