import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourcePicker } from './SourcePicker';

describe('SourcePicker audio-only enforcement', () => {
  const defaultProps = {
    activeSource: null as any,
    activeMusicTitle: null,
    classMusic: [],
    styles: [],
    events: [],
    selectedMusicId: null,
    onSelectClassMusic: vi.fn(),
    onFileSelected: vi.fn(),
    onYouTubeSelected: vi.fn()
  };

  it('allows audio/mp3 file and triggers onFileSelected', () => {
    const onFileSelected = vi.fn();
    render(<SourcePicker {...defaultProps} onFileSelected={onFileSelected} />);

    // Switch to My MP3 tab
    fireEvent.click(screen.getByRole('button', { name: /my mp3/i }));

    const input = screen.getByLabelText(/load mp3 or audio file/i) as HTMLInputElement;
    const mp3File = new File(['dummy audio content'], 'song.mp3', { type: 'audio/mpeg' });

    fireEvent.change(input, { target: { files: [mp3File] } });

    expect(onFileSelected).toHaveBeenCalledWith(mp3File);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects video/mp4 file and shows audio-only error', () => {
    const onFileSelected = vi.fn();
    render(<SourcePicker {...defaultProps} onFileSelected={onFileSelected} />);

    // Switch to My MP3 tab
    fireEvent.click(screen.getByRole('button', { name: /my mp3/i }));

    const input = screen.getByLabelText(/load mp3 or audio file/i) as HTMLInputElement;
    const mp4File = new File(['fake video data'], 'routine.mp4', { type: 'video/mp4' });

    fireEvent.change(input, { target: { files: [mp4File] } });

    expect(onFileSelected).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/only mp3 or audio/i);
    expect(alert).toHaveTextContent(/video/i);
  });
});
