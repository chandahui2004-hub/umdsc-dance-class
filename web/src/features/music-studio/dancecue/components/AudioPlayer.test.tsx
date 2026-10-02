import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudioPlayer } from './AudioPlayer';

const baseProps = {
  audioRef: { current: null },
  currentTime: 0,
  duration: 200,
  isLooping: false,
  isMarkerDraftActive: false,
  isPlaying: false,
  markerDraftRange: null,
  onLoopToggle: vi.fn(),
  onMarkerDraftChange: vi.fn(),
  onPause: vi.fn(),
  onPlay: vi.fn(),
  onSeek: vi.fn(),
  onSkip: vi.fn(),
  onSpeedChange: vi.fn(),
  playbackRate: 1
};

describe('AudioPlayer speed control', () => {
  it('lets the dancer change speed normally', () => {
    render(<AudioPlayer {...baseProps} />);
    expect(screen.getByRole('combobox', { name: 'Playback speed' })).toBeEnabled();
    expect(screen.queryByText("Speed isn't available for SoundCloud songs.")).toBeNull();
  });

  it('disables speed and says why when the song is on SoundCloud', () => {
    render(<AudioPlayer {...baseProps} speedDisabled />);
    expect(screen.getByRole('combobox', { name: 'Playback speed' })).toBeDisabled();
    expect(screen.getByText("Speed isn't available for SoundCloud songs.")).toBeInTheDocument();
  });
});
