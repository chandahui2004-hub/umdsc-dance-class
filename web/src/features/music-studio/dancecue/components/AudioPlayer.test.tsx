import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AudioPlayer } from './AudioPlayer';

if (typeof window !== 'undefined' && !window.PointerEvent) {
  window.PointerEvent = window.MouseEvent as any;
}

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

describe('AudioPlayer looping interactions', () => {
  it('renders dedicated handles and center span for an active loop range', () => {
    render(
      <AudioPlayer
        {...baseProps}
        isLooping={true}
        isMarkerDraftActive={true}
        markerDraftRange={{ start: 10, end: 14 }}
      />
    );

    expect(screen.getByTestId('loop-handle-start')).toBeInTheDocument();
    expect(screen.getByTestId('loop-handle-end')).toBeInTheDocument();
    expect(screen.getByTestId('loop-span')).toBeInTheDocument();
  });

  it('moves entire loop range when dragging center span', () => {
    const onMarkerDraftChange = vi.fn();
    render(
      <AudioPlayer
        {...baseProps}
        duration={100}
        isLooping={true}
        isMarkerDraftActive={true}
        markerDraftRange={{ start: 10, end: 14 }}
        onMarkerDraftChange={onMarkerDraftChange}
      />
    );

    const track = screen.getByRole('slider', { name: /marker duration|seek through/i });
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 36,
      right: 1000,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    const span = screen.getByTestId('loop-span');
    // Start drag at x = 120 (12s, center of 10s-14s)
    fireEvent.pointerDown(span, { clientX: 120 });
    // Move to x = 220 (+100px = +10s)
    fireEvent.pointerMove(window, { clientX: 220 });
    fireEvent.pointerUp(window, { clientX: 220 });

    expect(onMarkerDraftChange).toHaveBeenCalledWith({ start: 20, end: 24 });
  });

  it('adjusts nearest loop boundary on single click when loop is active', () => {
    const onMarkerDraftChange = vi.fn();
    render(
      <AudioPlayer
        {...baseProps}
        duration={100}
        isLooping={true}
        isMarkerDraftActive={true}
        markerDraftRange={{ start: 20, end: 40 }}
        onMarkerDraftChange={onMarkerDraftChange}
      />
    );

    const track = screen.getByRole('slider', { name: /marker duration|seek through/i });
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 36,
      right: 1000,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    // Click at x = 150 (15s, closer to start 20s than end 40s)
    fireEvent.pointerDown(track, { clientX: 150, detail: 1 });
    expect(onMarkerDraftChange).toHaveBeenCalledWith({ start: 15, end: 40 });
  });

  it('seeks playback on double click even when loop is active', () => {
    const onSeek = vi.fn();
    render(
      <AudioPlayer
        {...baseProps}
        duration={100}
        isLooping={true}
        isMarkerDraftActive={true}
        markerDraftRange={{ start: 20, end: 40 }}
        onSeek={onSeek}
      />
    );

    const track = screen.getByRole('slider', { name: /marker duration|seek through/i });
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 36,
      right: 1000,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    // Double click at x = 500 (50s)
    fireEvent.pointerDown(track, { clientX: 500, detail: 2 });
    expect(onSeek).toHaveBeenCalledWith(50);
  });
});
