import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSyncedVideo } from './useSyncedVideo';
import type { Master } from './types';

describe('useSyncedVideo', () => {
  let master: Master;
  let videoEl: HTMLVideoElement;
  let loopRestartCallback: ((loopStart: number) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    loopRestartCallback = null;

    master = {
      getTime: vi.fn().mockReturnValue(10),
      isPlaying: false,
      rate: 1,
      source: 'audio' as any,
      onLoopRestart: vi.fn((fn) => {
        loopRestartCallback = fn;
        return () => {
          loopRestartCallback = null;
        };
      }),
      pauseForBuffer: vi.fn(),
      resumeFromBuffer: vi.fn(),
    };

    videoEl = document.createElement('video');
    vi.spyOn(videoEl, 'play').mockResolvedValue(undefined);
    vi.spyOn(videoEl, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes muted to true by default', () => {
    const videoRef = { current: videoEl };
    const { result } = renderHook(() =>
      useSyncedVideo({
        master,
        videoRef,
        videoStart: 5,
        enabled: true,
      })
    );

    expect(result.current.muted).toBe(true);
    expect(videoEl.muted).toBe(true);
  });

  it('toggles muted state and syncs with video element', () => {
    const videoRef = { current: videoEl };
    const { result } = renderHook(() =>
      useSyncedVideo({
        master,
        videoRef,
        videoStart: 5,
        enabled: true,
      })
    );

    act(() => {
      result.current.setMuted(false);
    });

    expect(result.current.muted).toBe(false);
    expect(videoEl.muted).toBe(false);
  });

  it('seeks video to videoStart when loop restarts', () => {
    const videoRef = { current: videoEl };
    renderHook(() =>
      useSyncedVideo({
        master,
        videoRef,
        videoStart: 4.5,
        enabled: true,
      })
    );

    expect(loopRestartCallback).toBeTruthy();

    act(() => {
      loopRestartCallback?.(0);
    });

    expect(videoEl.currentTime).toBe(4.5);
  });

  it('pauses master if video buffers for more than 500ms', () => {
    const videoRef = { current: videoEl };
    const { result } = renderHook(() =>
      useSyncedVideo({
        master,
        videoRef,
        videoStart: 0,
        enabled: true,
      })
    );

    act(() => {
      videoEl.dispatchEvent(new Event('waiting'));
    });

    // Advance time by 300ms: not yet 500ms
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(master.pauseForBuffer).not.toHaveBeenCalled();

    // Advance time by another 250ms: total 550ms
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(master.pauseForBuffer).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('buffering');

    // On canplay, master resumes
    act(() => {
      videoEl.dispatchEvent(new Event('canplay'));
    });
    expect(master.resumeFromBuffer).toHaveBeenCalledTimes(1);
  });
});
