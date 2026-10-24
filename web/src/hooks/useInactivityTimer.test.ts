// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInactivityTimer } from './useInactivityTimer';

describe('useInactivityTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in active state (isInactive: false)', () => {
    const { result } = renderHook(() => useInactivityTimer(15000));
    expect(result.current.isInactive).toBe(false);
  });

  it('triggers inactivity and picks random dance after timeout', () => {
    const { result } = renderHook(() => useInactivityTimer(15000));

    act(() => {
      vi.advanceTimersByTime(14999);
    });
    expect(result.current.isInactive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isInactive).toBe(true);
    expect([0, 1, 2]).toContain(result.current.activeDanceIndex);
  });

  it('resets to active when pointermove or keydown occurs', () => {
    const { result } = renderHook(() => useInactivityTimer(15000));

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(result.current.isInactive).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(result.current.isInactive).toBe(false);
  });

  it('cleans up event listeners on unmount', () => {
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useInactivityTimer(15000));
    unmount();
    expect(removeListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('allows manual resetTimer', () => {
    const { result } = renderHook(() => useInactivityTimer(15000));

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(result.current.isInactive).toBe(true);

    act(() => {
      result.current.resetTimer();
    });
    expect(result.current.isInactive).toBe(false);
  });
});
