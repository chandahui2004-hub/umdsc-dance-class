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
    onYouTubeSelected: vi.fn(),
    onSoundCloudSelected: vi.fn()
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

describe('SourcePicker Link tab (YouTube or SoundCloud)', () => {
  const props = {
    activeSource: null as any,
    activeMusicTitle: null,
    classMusic: [],
    styles: [],
    events: [],
    selectedMusicId: null,
    onSelectClassMusic: vi.fn(),
    onFileSelected: vi.fn(),
    onYouTubeSelected: vi.fn(),
    onSoundCloudSelected: vi.fn()
  };

  function paste(value: string, handlers: Partial<typeof props> = {}) {
    render(<SourcePicker {...props} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Music link'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Use link' }));
  }

  it('has a Link tab instead of a YouTube tab', () => {
    render(<SourcePicker {...props} />);
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'YouTube' })).toBeNull();
  });

  it('plays a pasted YouTube link', () => {
    const onYouTubeSelected = vi.fn();
    paste('https://youtu.be/4_KN-gA6uXY', { onYouTubeSelected });
    expect(onYouTubeSelected).toHaveBeenCalledWith('4_KN-gA6uXY');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('plays a pasted SoundCloud link with its canonical url', () => {
    const onSoundCloudSelected = vi.fn();
    paste('https://soundcloud.com/forss/flickermood?si=abc', { onSoundCloudSelected });
    expect(onSoundCloudSelected).toHaveBeenCalledWith('https://soundcloud.com/forss/flickermood');
  });

  it('explains that Spotify songs cannot be played here and loads nothing', () => {
    const onYouTubeSelected = vi.fn();
    const onSoundCloudSelected = vi.fn();
    paste('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', { onYouTubeSelected, onSoundCloudSelected });

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Spotify songs can't be played here. Paste the YouTube version, or open it in Spotify."
    );
    expect(onYouTubeSelected).not.toHaveBeenCalled();
    expect(onSoundCloudSelected).not.toHaveBeenCalled();
  });

  it('asks for the full SoundCloud link instead of a short link', () => {
    const onSoundCloudSelected = vi.fn();
    paste('https://on.soundcloud.com/AbC123', { onSoundCloudSelected });

    expect(screen.getByRole('alert')).toHaveTextContent(/full SoundCloud track link/);
    expect(onSoundCloudSelected).not.toHaveBeenCalled();
  });

  it('points a Google Drive link to the My MP3 tab', () => {
    paste('https://drive.google.com/file/d/1TjtHZFlOXrPuUGBXfT1egskZystytc2f/view');
    expect(screen.getByRole('alert')).toHaveTextContent(/My MP3/);
  });

  it('shows the reason for an unsupported link', () => {
    paste('https://tiktok.com/@x/video/1');
    expect(screen.getByRole('alert')).toHaveTextContent(/YouTube/);
  });
});
