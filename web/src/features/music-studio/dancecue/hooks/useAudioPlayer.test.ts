import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioPlayer } from './useAudioPlayer';

const CUED = 5;
const PLAYING = 1;
const PAUSED = 2;

function setup() {
  const audio = document.createElement('audio');
  audio.pause = vi.fn(); // jsdom does not implement media playback
  audio.load = vi.fn();
  const audioRef = { current: audio };
  const yt = {
    cueVideoById: vi.fn(),
    loadVideoById: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    setPlaybackRate: vi.fn(),
    getDuration: vi.fn(() => 256),
    getCurrentTime: vi.fn(() => 0),
    getPlaybackRate: vi.fn(() => 1),
    destroy: vi.fn()
  };
  const hook = renderHook(() => useAudioPlayer({ audioRef, markers: [] }));
  act(() => hook.result.current.attachYouTubePlayer(yt));
  act(() => hook.result.current.loadYouTube('4_KN-gA6uXY'));
  return { hook, yt };
}

describe('useAudioPlayer YouTube play requests', () => {
  it('starts playback once the track is cued when Play was pressed too early', async () => {
    const { hook, yt } = setup();

    // YouTube drops a playVideo() that arrives before the cued track has loaded.
    await act(async () => {
      await hook.result.current.play();
    });
    expect(yt.playVideo).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.handleYouTubeStateChange(CUED));
    expect(yt.playVideo).toHaveBeenCalledTimes(2);
  });

  it('does not start playback on cue when the dancer paused', async () => {
    const { hook, yt } = setup();
    await act(async () => {
      await hook.result.current.play();
    });
    act(() => hook.result.current.pause());

    act(() => hook.result.current.handleYouTubeStateChange(CUED));
    expect(yt.playVideo).toHaveBeenCalledTimes(1);
  });

  it('does not replay on a later cue once playback has started', async () => {
    const { hook, yt } = setup();
    await act(async () => {
      await hook.result.current.play();
    });
    act(() => hook.result.current.handleYouTubeStateChange(PLAYING));

    act(() => hook.result.current.handleYouTubeStateChange(CUED));
    expect(yt.playVideo).toHaveBeenCalledTimes(1);
  });

  it('forgets a pending Play when a different track is chosen', async () => {
    const { hook, yt } = setup();
    await act(async () => {
      await hook.result.current.play();
    });

    act(() => hook.result.current.loadYouTube('aaaaaaaaaaa'));
    act(() => hook.result.current.handleYouTubeStateChange(CUED));
    expect(yt.playVideo).toHaveBeenCalledTimes(1);
  });

  it('does not restart playback after YouTube reports paused', async () => {
    const { hook, yt } = setup();
    await act(async () => {
      await hook.result.current.play();
    });
    act(() => hook.result.current.handleYouTubeStateChange(PAUSED));

    act(() => hook.result.current.handleYouTubeStateChange(CUED));
    expect(yt.playVideo).toHaveBeenCalledTimes(1);
  });
});
