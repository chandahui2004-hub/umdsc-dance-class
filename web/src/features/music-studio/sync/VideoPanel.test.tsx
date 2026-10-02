import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { VideoItem } from '@umdsc/shared';
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
});
