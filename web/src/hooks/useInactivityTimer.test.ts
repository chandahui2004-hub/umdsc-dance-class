// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInactivityTimer, _resetInternalStateForTesting, resetMascotToIdle } from './useInactivityTimer';

describe('useInactivityTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetInternalStateForTesting();
    resetMascotToIdle(5000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in active state (isInactive: false)', () => {
    const { result } = renderHook(() => useInactivityTimer(5000));
    expect(result.current.isInactive).toBe(false);
  });

  it('triggers inactivity after 5000ms and starts at dance 0', () => {
    const { result } = renderHook(() => useInactivityTimer(5000));

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.isInactive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isInactive).toBe(true);
    expect(result.current.activeDanceIndex).toBe(0);
  });

  it('rotates sequentially through dance 0 -> 1 -> 2 -> 0 every 2500ms while inactive', () => {
    const { result } = renderHook(() => useInactivityTimer(5000));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isInactive).toBe(true);
    expect(result.current.activeDanceIndex).toBe(0); // Dance 1

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.activeDanceIndex).toBe(1); // Dance 2

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.activeDanceIndex).toBe(2); // Dance 3

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.activeDanceIndex).toBe(0); // Dance 1 again
  });

  it('does NOT reset dancing on arbitrary mousemove or scroll events', () => {
    const { result } = renderHook(() => useInactivityTimer(5000));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isInactive).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('pointermove'));
      window.dispatchEvent(new Event('scroll'));
    });
    // Still dancing!
    expect(result.current.isInactive).toBe(true);
  });

  it('returns to idle and restarts countdown when resetTimer is called (mascot click)', () => {
    const { result } = renderHook(() => useInactivityTimer(5000));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isInactive).toBe(true);

    act(() => {
      result.current.resetTimer();
    });
    expect(result.current.isInactive).toBe(false);

    // After another 5000ms, starts dancing again
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isInactive).toBe(true);
  });
});
