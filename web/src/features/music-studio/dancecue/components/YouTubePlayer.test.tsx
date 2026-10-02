import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { YouTubePlayer } from './YouTubePlayer';

describe('YouTubePlayer audio optimization', () => {
  let mockPlayerInstance: any;
  let playerEvents: any;

  beforeEach(() => {
    playerEvents = {};
    mockPlayerInstance = {
      cueVideoById: vi.fn(),
      loadVideoById: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      setPlaybackRate: vi.fn(),
      setPlaybackQuality: vi.fn(),
      getDuration: vi.fn(() => 0), // Duration starts at 0 (cue state)
      getCurrentTime: vi.fn(() => 0),
      getPlaybackRate: vi.fn(() => 1),
      destroy: vi.fn()
    };

    window.YT = {
      Player: vi.fn((_el: any, options: any) => {
        playerEvents = options.events;
        return mockPlayerInstance;
      }) as any
    };
  });

  it('initializes player with optimized minimal playerVars and preconnect links', async () => {
    const onReady = vi.fn();
    const onStateChange = vi.fn();

    render(
      <YouTubePlayer
        isVisible={true}
        onReady={onReady}
        onStateChange={onStateChange}
        videoId="dQw4w9WgXcQ"
      />
    );

    // Wait for async loadYouTubeApi promise
    await vi.waitFor(() => {
      expect(window.YT?.Player).toHaveBeenCalled();
    });

    const playerCallArgs = (window.YT?.Player as any).mock.calls[0][1];
    expect(playerCallArgs.playerVars.modestbranding).toBe(1);
    expect(playerCallArgs.playerVars.controls).toBe(0);

    // Verify preconnect links for YouTube exist in document
    const preconnects = Array.from(document.querySelectorAll('link[rel="preconnect"]')).map(
      l => l.getAttribute('href')
    );
    expect(preconnects).toContain('https://www.youtube.com');
  });

  it('marks audio ready immediately onReady without blocking on getDuration > 0', async () => {
    const onReady = vi.fn();
    const onStateChange = vi.fn();

    render(
      <YouTubePlayer
        isVisible={true}
        onReady={onReady}
        onStateChange={onStateChange}
        videoId="dQw4w9WgXcQ"
      />
    );

    await vi.waitFor(() => {
      expect(playerEvents.onReady).toBeDefined();
    });

    // Fire onReady event from YouTube API
    act(() => {
      playerEvents.onReady({ target: mockPlayerInstance });
    });

    expect(onReady).toHaveBeenCalledWith(mockPlayerInstance);
    // Should request small (144p) quality to minimize bandwidth
    expect(mockPlayerInstance.setPlaybackQuality).toHaveBeenCalledWith('small');
    // Status should be ready even if getDuration is 0
    expect(screen.getByText('YouTube audio ready')).toBeInTheDocument();
  });
});

describe('YouTubePlayer construction (real API rejects an empty videoId)', () => {
  let instance: any;
  let events: any;
  let options: any[];

  beforeEach(() => {
    events = {};
    options = [];
    instance = {
      cueVideoById: vi.fn(),
      loadVideoById: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      setPlaybackRate: vi.fn(),
      setPlaybackQuality: vi.fn(),
      getDuration: vi.fn(() => 0),
      getCurrentTime: vi.fn(() => 0),
      getPlaybackRate: vi.fn(() => 1),
      destroy: vi.fn()
    };
    window.YT = {
      Player: vi.fn((_el: any, opts: any) => {
        // The real widget API throws this for { videoId: undefined } (verified in Chrome and Edge).
        if ('videoId' in opts && !opts.videoId) throw new Error('Invalid video id');
        events = opts.events;
        options.push(opts);
        return instance;
      }) as any
    };
  });

  const renderPlayer = (videoId: string | null, onReady = vi.fn()) =>
    render(
      <YouTubePlayer isVisible={true} onReady={onReady} onStateChange={vi.fn()} videoId={videoId} />
    );

  it('does not pass a videoId key when no track is chosen yet', async () => {
    renderPlayer(null);
    await vi.waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());
    expect('videoId' in options[0]).toBe(false);
  });

  it('cues a track chosen after the player is ready', async () => {
    const view = renderPlayer(null);
    await vi.waitFor(() => expect(events.onReady).toBeDefined());
    act(() => events.onReady({ target: instance }));

    view.rerender(
      <YouTubePlayer isVisible={true} onReady={vi.fn()} onStateChange={vi.fn()} videoId="4_KN-gA6uXY" />
    );

    await vi.waitFor(() => expect(instance.cueVideoById).toHaveBeenCalledWith('4_KN-gA6uXY'));
  });

  it('reuses one player across track changes', async () => {
    const view = renderPlayer('aaaaaaaaaaa');
    await vi.waitFor(() => expect(events.onReady).toBeDefined());
    act(() => events.onReady({ target: instance }));

    view.rerender(
      <YouTubePlayer isVisible={true} onReady={vi.fn()} onStateChange={vi.fn()} videoId="bbbbbbbbbbb" />
    );
    await vi.waitFor(() => expect(instance.cueVideoById).toHaveBeenCalledWith('bbbbbbbbbbb'));
    expect(window.YT?.Player).toHaveBeenCalledTimes(1);
  });

  it('shows the cannot-play message when YouTube refuses the video', async () => {
    renderPlayer('aaaaaaaaaaa');
    await vi.waitFor(() => expect(events.onError).toBeDefined());
    act(() => events.onError({ data: 150 }));
    expect(screen.getByText('This YouTube link cannot be played here.')).toBeInTheDocument();
  });

  it('never calls player methods before onReady', async () => {
    renderPlayer('aaaaaaaaaaa');
    await vi.waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 700)); // longer than the 500 ms duration poll
    expect(instance.getDuration).not.toHaveBeenCalled();
    expect(instance.cueVideoById).not.toHaveBeenCalled();
  });
});
