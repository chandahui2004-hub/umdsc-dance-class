import { useState, useEffect, useCallback } from 'react';

export interface InactivityState {
  isInactive: boolean;
  activeDanceIndex: 0 | 1 | 2;
  resetTimer: () => void;
}

// Module-level persistent state so route changes & modal opens don't interrupt the countdown or dancing
type Listener = () => void;
const listeners = new Set<Listener>();

let isDancing = false;
let currentDanceIndex: 0 | 1 | 2 = 0;
let countdownTimer: ReturnType<typeof setTimeout> | null = null;
let danceCycleInterval: ReturnType<typeof setInterval> | null = null;

function notify() {
  listeners.forEach(fn => fn());
}

function startDancing() {
  if (isDancing) return;
  isDancing = true;
  currentDanceIndex = 0;
  notify();

  if (danceCycleInterval) clearInterval(danceCycleInterval);
  // Sequentially cycle: Dance 1 -> Dance 2 -> Dance 3 -> Dance 1 every 2.5s (2.5 loops of 8-fps routine)
  danceCycleInterval = setInterval(() => {
    if (isDancing) {
      currentDanceIndex = ((currentDanceIndex + 1) % 3) as 0 | 1 | 2;
      notify();
    }
  }, 2500);
}

export function resetMascotToIdle(timeoutMs = 5000) {
  isDancing = false;
  if (danceCycleInterval) {
    clearInterval(danceCycleInterval);
    danceCycleInterval = null;
  }
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
  notify();

  countdownTimer = setTimeout(() => {
    startDancing();
  }, timeoutMs);
}

// Testing helper to reset internal timers completely
export function _resetInternalStateForTesting() {
  isDancing = false;
  currentDanceIndex = 0;
  if (danceCycleInterval) {
    clearInterval(danceCycleInterval);
    danceCycleInterval = null;
  }
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
  listeners.clear();
}

// Initialize initial countdown if not already running
if (!countdownTimer && !isDancing) {
  countdownTimer = setTimeout(() => {
    startDancing();
  }, 5000);
}

export function useInactivityTimer(timeoutMs = 5000): InactivityState {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onStateChange = () => setTick(t => t + 1);
    listeners.add(onStateChange);
    return () => {
      listeners.delete(onStateChange);
    };
  }, []);

  const resetTimer = useCallback(() => {
    resetMascotToIdle(timeoutMs);
  }, [timeoutMs]);

  return {
    isInactive: isDancing,
    activeDanceIndex: currentDanceIndex,
    resetTimer
  };
}
