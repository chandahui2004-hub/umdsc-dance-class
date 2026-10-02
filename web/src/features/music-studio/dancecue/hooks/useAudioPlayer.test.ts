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

describe('useAudioPlayer needsTap (phones block play on an untouched iframe)', () => {
  it('sets needsTap when YouTube has not started playing within 3 s, and clears it on playing', async () => {
    vi.useFakeTimers();
    try {
      const { hook } = setup();
      await act(async () => {
        await hook.result.current.play();
      });
      expect(hook.result.current.needsTap).toBe(false);

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(hook.result.current.needsTap).toBe(true);

      act(() => hook.result.current.handleYouTubeStateChange(PLAYING));
      expect(hook.result.current.needsTap).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not set needsTap when playing starts in time', async () => {
    vi.useFakeTimers();
    try {
      const { hook } = setup();
      await act(async () => {
        await hook.result.current.play();
      });
      act(() => hook.result.current.handleYouTubeStateChange(PLAYING));
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(hook.result.current.needsTap).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears needsTap when the dancer pauses or picks another track', async () => {
    vi.useFakeTimers();
    try {
      const { hook } = setup();
      await act(async () => {
        await hook.result.current.play();
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(hook.result.current.needsTap).toBe(true);

      act(() => hook.result.current.loadYouTube('aaaaaaaaaaa'));
      expect(hook.result.current.needsTap).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useAudioPlayer with a SoundCloud song', () => {
  const marker = { id: 'm1', name: 'Chorus', time: 10, endTime: 20 };

  function setupSoundCloud() {
    const audio = document.createElement('audio');
    audio.pause = vi.fn();
    audio.load = vi.fn();
    const audioRef = { current: audio };
    let positionMs = 0;
    const sc = {
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn(),
      getPosition: vi.fn((cb: (ms: number) => void) => cb(positionMs)),
      getDuration: vi.fn((cb: (ms: number) => void) => cb(214000))
    };
    const hook = renderHook(() => useAudioPlayer({ audioRef, markers: [marker] }));
    act(() => hook.result.current.loadSoundCloud('https://soundcloud.com/forss/flickermood'));
    act(() => hook.result.current.attachSoundCloudPlayer(sc));
    return { hook, sc, setPositionMs: (ms: number) => (positionMs = ms) };
  }

  it('plays, pauses and seeks through the widget (SoundCloud takes milliseconds)', async () => {
    const { hook, sc } = setupSoundCloud();

    await act(async () => {
      await hook.result.current.play();
    });
    expect(sc.play).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.pause());
    expect(sc.pause).toHaveBeenCalled();

    act(() => hook.result.current.seekTo(30));
    expect(sc.seekTo).toHaveBeenCalledWith(30000);
  });

  it('is the active source and reports isPlaying from the widget events', () => {
    const { hook } = setupSoundCloud();

    expect(hook.result.current.activeSource).toBe('soundcloud');
    act(() => hook.result.current.handleSoundCloudPlayState(true));
    expect(hook.result.current.isPlaying).toBe(true);
    act(() => hook.result.current.handleSoundCloudPlayState(false));
    expect(hook.result.current.isPlaying).toBe(false);
  });

  it('has no speed control: speedDisabled, and a speed change does not alter the rate', () => {
    const { hook } = setupSoundCloud();

    expect(hook.result.current.speedDisabled).toBe(true);
    act(() => hook.result.current.setSpeed(1.25));

    expect(hook.result.current.playbackRate).toBe(1);
    expect(hook.result.current.effectiveRate).toBe(1);
  });

  it('seeks back to the section start when the loop end is reached', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame']
    });
    try {
      const { hook, sc, setPositionMs } = setupSoundCloud();
      setPositionMs(15000);

      await act(async () => {
        await hook.result.current.startLoop(marker);
      });
      act(() => hook.result.current.handleSoundCloudPlayState(true));
      sc.seekTo.mockClear();

      setPositionMs(20300); // past the end of the 10-20 s section
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(sc.seekTo).toHaveBeenCalledWith(10000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for a tap when SoundCloud has not started 3 s after Play', async () => {
    vi.useFakeTimers();
    try {
      const { hook } = setupSoundCloud();
      await act(async () => {
        await hook.result.current.play();
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(hook.result.current.needsTap).toBe(true);

      act(() => hook.result.current.handleSoundCloudPlayState(true));
      expect(hook.result.current.needsTap).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops SoundCloud when the dancer switches to a YouTube song', () => {
    const { hook, sc } = setupSoundCloud();

    act(() => hook.result.current.loadYouTube('4_KN-gA6uXY'));

    expect(sc.pause).toHaveBeenCalled();
    expect(hook.result.current.activeSource).toBe('youtube');
  });
});
