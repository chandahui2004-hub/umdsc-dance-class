import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { VideoTimeline } from './VideoTimeline';

describe('VideoTimeline interactions', () => {
  it('does not trigger onSeek when dragging the video start flag', () => {
    const onSeek = vi.fn();
    const onSetVideoStart = vi.fn();

    render(
      <VideoTimeline
        currentTime={5}
        duration={100}
        videoStart={10}
        onSeek={onSeek}
        onSetVideoStart={onSetVideoStart}
      />
    );

    const flag = screen.getByTitle(/start flag/i);
    const track = screen.getByTitle(/click to seek video/i);

    // Mock getBoundingClientRect on track
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 24,
      right: 1000,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    // Mouse down on flag
    fireEvent.mouseDown(flag, { clientX: 100 });
    // Mouse move on window
    fireEvent.mouseMove(window, { clientX: 200 });
    // Mouse up on window
    fireEvent.mouseUp(window, { clientX: 200 });

    // Click that bubbles on track after releasing flag
    fireEvent.click(track, { clientX: 200 });

    expect(onSetVideoStart).toHaveBeenCalled();
    // onSeek should NOT have been called because of the flag drag!
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('triggers onSeek when clicking directly on the track without dragging flag', () => {
    const onSeek = vi.fn();
    const onSetVideoStart = vi.fn();

    render(
      <VideoTimeline
        currentTime={5}
        duration={100}
        videoStart={10}
        onSeek={onSeek}
        onSetVideoStart={onSetVideoStart}
      />
    );

    const track = screen.getByTitle(/click to seek video/i);
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 24,
      right: 1000,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    fireEvent.click(track, { clientX: 500 });
    expect(onSeek).toHaveBeenCalledWith(50);
  });
});
