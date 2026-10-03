import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('allows opening loops drawer and selecting a loop to rehearse', () => {
    const onStartLoopMarker = vi.fn();
    const testMarkers = [
      { id: 'class-1', name: 'Intro Routine', time: 5, endTime: 15 },
      { id: 'loop-2', name: 'Choreo Section 1', time: 20, endTime: 35 }
    ];

    render(
      <FullscreenStudio
        {...defaultProps}
        markers={testMarkers}
        classMarkers={[testMarkers[0]]}
        myLoops={[testMarkers[1]]}
        onStartLoopMarker={onStartLoopMarker}
      />
    );

    // Click LOOPS button on HUD
    const toggleLoopsBtn = screen.getByRole('button', { name: /toggle loops/i });
    fireEvent.click(toggleLoopsBtn);

    // Loop drawer should be visible
    expect(screen.getByTestId('fullscreen-loops-drawer')).toBeInTheDocument();
    expect(screen.getByText('Intro Routine')).toBeInTheDocument();
    expect(screen.getByText('Choreo Section 1')).toBeInTheDocument();

    // Click LOOP on Choreo Section 1
    const loopBtns = screen.getAllByRole('button', { name: /▶ loop/i });
    fireEvent.click(loopBtns[1]);
    expect(onStartLoopMarker).toHaveBeenCalledWith(testMarkers[1]);
  });

  it('supports adding, editing, and deleting loops in fullscreen mode', () => {
    const onAddLoopMarker = vi.fn();
    const onUpdateLoopMarker = vi.fn();
    const onDeleteLoopMarker = vi.fn();

    const myLoop = { id: 'my-loop-1', name: 'Practice Verse', time: 10, endTime: 25 };

    render(
      <FullscreenStudio
        {...defaultProps}
        markers={[myLoop]}
        myLoops={[myLoop]}
        onAddLoopMarker={onAddLoopMarker}
        onUpdateLoopMarker={onUpdateLoopMarker}
        onDeleteLoopMarker={onDeleteLoopMarker}
      />
    );

    // 1. Add loop
    const saveBtn = screen.getByRole('button', { name: /save loop/i });
    fireEvent.click(saveBtn);

    expect(screen.getByTestId('fullscreen-loops-drawer')).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText(/loop name/i);
    fireEvent.change(nameInput, { target: { value: 'New Footwork' } });

    const submitBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(submitBtn);
    expect(onAddLoopMarker).toHaveBeenCalledWith('New Footwork', expect.any(Number), expect.any(Number));

    // 2. Edit loop
    const editBtn = screen.getByTitle(/edit loop timing/i);
    fireEvent.click(editBtn);

    const editNameInput = screen.getByPlaceholderText(/loop name/i);
    fireEvent.change(editNameInput, { target: { value: 'Updated Footwork' } });
    const updateBtn = screen.getByRole('button', { name: /^update$/i });
    fireEvent.click(updateBtn);
    expect(onUpdateLoopMarker).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'my-loop-1', name: 'Updated Footwork' })
    );

    // 3. Delete loop
    const deleteBtn = screen.getByTitle(/delete loop/i);
    fireEvent.click(deleteBtn);
    expect(onDeleteLoopMarker).toHaveBeenCalledWith('my-loop-1');
  });

  it('rounds raw fractional draft range to nearest 0.1s when opening and saving loop', () => {
    const onAddLoopMarker = vi.fn();

    render(
      <FullscreenStudio
        {...defaultProps}
        markerDraftRange={{ start: 61.21439885210618, end: 87.19646702861023 }}
        onAddLoopMarker={onAddLoopMarker}
      />
    );

    // Open add loop modal via "+ SAVE" in HUD
    const saveLoopBtn = screen.getByRole('button', { name: /save loop/i });
    fireEvent.click(saveLoopBtn);

    // Inputs should be rounded to 61.2 and 87.2
    const startInput = screen.getByLabelText(/start \(s\):/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/end \(s\):/i) as HTMLInputElement;

    expect(Number(startInput.value)).toBe(61.2);
    expect(Number(endInput.value)).toBe(87.2);

    // Save and verify exact rounded values passed to onAddLoopMarker
    const submitBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(submitBtn);

    expect(onAddLoopMarker).toHaveBeenCalledWith('Loop 1', 61.2, 87.2);
  });
});

