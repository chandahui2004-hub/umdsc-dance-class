import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FullscreenStudio } from './FullscreenStudio';

describe('FullscreenStudio Component', () => {
  const defaultProps = {
    activeMusicTitle: 'Test Song',
    currentTime: 15,
    duration: 120,
    isPlaying: false,
    isLooping: true,
    markerDraftRange: { start: 10, end: 25 },
    playbackRate: 1,
    activeSource: 'youtube' as const,
    youtubeVideoId: 'yt-123',
    danceVideoUrl: 'https://example.com/dance.mp4',
    videoCurrentTime: 12,
    videoDuration: 110,
    videoStart: 3,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onToggleLoop: vi.fn(),
    onSeek: vi.fn(),
    onSpeedChange: vi.fn(),
    onSetInPoint: vi.fn(),
    onSetOutPoint: vi.fn(),
    onExitFullscreen: vi.fn(),
  };

  it('renders single priority video: dance video suppresses youtube player when present', () => {
    render(<FullscreenStudio {...defaultProps} />);

    // Dance video element should be present
    expect(screen.getByTestId('fullscreen-dance-video')).toBeInTheDocument();
    // YouTube player container should NOT be rendered when dance video is present
    expect(screen.queryByTestId('fullscreen-youtube-player')).toBeNull();
  });

  it('renders youtube player when dance video is not present', () => {
    render(<FullscreenStudio {...defaultProps} danceVideoUrl={null} />);

    expect(screen.getByTestId('fullscreen-youtube-player')).toBeInTheDocument();
    expect(screen.queryByTestId('fullscreen-dance-video')).toBeNull();
  });

  it('renders floating HUD pill with all interactive controls', () => {
    render(<FullscreenStudio {...defaultProps} />);

    // Floating HUD
    expect(screen.getByTestId('fullscreen-hud')).toBeInTheDocument();

    // Play/Pause button
    const playBtn = screen.getByRole('button', { name: /play/i });
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);
    expect(defaultProps.onPlay).toHaveBeenCalled();

    // Loop button with active status
    const loopBtn = screen.getByRole('button', { name: /loop on/i });
    expect(loopBtn).toBeInTheDocument();
    fireEvent.click(loopBtn);
    expect(defaultProps.onToggleLoop).toHaveBeenCalled();

    // Range duration label (25 - 10 = 15.0s)
    expect(screen.getByText(/15\.0s/i)).toBeInTheDocument();

    // Set In / Out buttons
    const setInBtn = screen.getByRole('button', { name: /set a|set in/i });
    expect(setInBtn).toBeInTheDocument();
    fireEvent.click(setInBtn);
    expect(defaultProps.onSetInPoint).toHaveBeenCalled();

    const setOutBtn = screen.getByRole('button', { name: /set b|set out/i });
    expect(setOutBtn).toBeInTheDocument();
    fireEvent.click(setOutBtn);
    expect(defaultProps.onSetOutPoint).toHaveBeenCalled();

    // Exit Fullscreen button
    const exitBtn = screen.getByRole('button', { name: /exit/i });
    expect(exitBtn).toBeInTheDocument();
    fireEvent.click(exitBtn);
    expect(defaultProps.onExitFullscreen).toHaveBeenCalled();
  });

  it('renders stacked music and video progress bars', () => {
    render(<FullscreenStudio {...defaultProps} />);

    expect(screen.getByText(/MUSIC:/i)).toBeInTheDocument();
    expect(screen.getByText(/VIDEO:/i)).toBeInTheDocument();
  });
});
