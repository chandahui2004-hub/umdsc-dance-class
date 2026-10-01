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
