import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { VideoItem, EventSummary, DanceStyle } from '@umdsc/shared';
import { VideoPanel } from './VideoPanel';
import type { Master } from './types';

const master: Master = {
  getTime: () => 0,
  isPlaying: false,
  rate: 1,
  source: 'youtube',
  onLoopRestart: () => () => {},
  pauseForBuffer: () => {},
  resumeFromBuffer: () => {}
};

const video = {
  id: 'v1', title: 'Class recap', driveFileId: 'drive-1', sessionId: 's1', styleId: 'st1', eventId: 'e1',
  version: 1, updatedBy: 'a', updatedAt: '', active: true
} as unknown as VideoItem;

const video2 = {
  id: 'v2', title: 'Popping recap', driveFileId: 'drive-2', sessionId: 's2', styleId: 'st2', eventId: 'e2',
  version: 1, updatedBy: 'a', updatedAt: '', active: true
} as unknown as VideoItem;

const NOTICE = "This device can't show this video's format (H.265). Ask an admin to re-upload it as H.264 MP4.";

function openVideo(dimensions: { w: number; h: number }) {
  const view = render(
    <VideoPanel master={master} videos={[video]} activeMusic={null} activeLoopMarker={null} />
  );
  fireEvent.change(screen.getByLabelText('Select class video'), { target: { value: 'v1' } });
  const el = view.container.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(el, 'videoWidth', { value: dimensions.w, configurable: true });
  Object.defineProperty(el, 'videoHeight', { value: dimensions.h, configurable: true });
  fireEvent.loadedData(el);
  return view;
}

describe('VideoPanel no-picture notice', () => {
  beforeEach(() => {
    // jsdom does not implement media playback
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  it('explains when the video has sound but no decodable picture', () => {
    openVideo({ w: 0, h: 0 });
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('shows no notice when the picture decodes', () => {
    openVideo({ w: 1920, h: 1080 });
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('filters class videos by event and dance style', () => {
    const events: EventSummary[] = [
      { id: 'e1', name: 'October Class', startDate: '2026-10-01', endDate: '2026-10-31', type: 'monthly', status: 'active', styleIds: ['st1'] },
      { id: 'e2', name: 'November Class', startDate: '2026-11-01', endDate: '2026-11-30', type: 'monthly', status: 'active', styleIds: ['st2'] }
    ];
    const styles: DanceStyle[] = [
      { id: 'st1', name: 'Locking', aliases: ['locking'], colorKey: 'orange', defaultWeekday: null, defaultStart: '', defaultEnd: '', defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '', version: 1, updatedBy: 'test', updatedAt: '2026-10-01', active: true },
      { id: 'st2', name: 'Popping', aliases: ['popping'], colorKey: 'blue', defaultWeekday: null, defaultStart: '', defaultEnd: '', defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: '', version: 1, updatedBy: 'test', updatedAt: '2026-10-01', active: true }
    ];

    render(
      <VideoPanel
        master={master}
        videos={[video, video2]}
        events={events}
        styles={styles}
        activeMusic={null}
        activeLoopMarker={null}
      />
    );

    // Initial state: all events and styles
    const videoSelect = screen.getByLabelText('Select class video') as HTMLSelectElement;
    expect(videoSelect).toContainHTML('Class recap');
    expect(videoSelect).toContainHTML('Popping recap');

    // Filter by Event: e1 (October Class)
    fireEvent.change(screen.getByLabelText('Filter videos by event'), { target: { value: 'e1' } });
    expect(videoSelect).toContainHTML('Class recap');
    expect(videoSelect).not.toContainHTML('Popping recap');

    // Filter by Style: st2 (Popping) while on e1 -> none match
    fireEvent.change(screen.getByLabelText('Filter videos by style'), { target: { value: 'st2' } });
    expect(videoSelect).not.toContainHTML('Class recap');
    expect(videoSelect).not.toContainHTML('Popping recap');

    // Reset Event to all -> Popping recap shows
    fireEvent.change(screen.getByLabelText('Filter videos by event'), { target: { value: 'all' } });
    expect(videoSelect).toContainHTML('Popping recap');
  });

  it('allows uploading a local video to play locally without saving to Drive', () => {
    const onSelectLocalVideo = vi.fn();
    const { container } = render(
      <VideoPanel
        master={master}
        videos={[video]}
        activeMusic={null}
        activeLoopMarker={null}
        onSelectLocalVideo={onSelectLocalVideo}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const localFile = new File(['dummy video bytes'], 'rehearsal_clip.mp4', { type: 'video/mp4' });
    fireEvent.change(fileInput, { target: { files: [localFile] } });

    expect(onSelectLocalVideo).toHaveBeenCalledWith(localFile);
  });
});
