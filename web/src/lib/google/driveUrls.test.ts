import { describe, it, expect } from 'vitest';
import { streamUrl, downloadUrl, openInDriveUrl } from './driveUrls';

describe('driveUrls', () => {
  it('streamUrl formats correctly with API key', () => {
    expect(streamUrl('abc')).toBe(
      `https://www.googleapis.com/drive/v3/files/abc?alt=media&key=${import.meta.env.VITE_GOOGLE_API_KEY}`
    );
  });

  it('downloadUrl formats correctly', () => {
    expect(downloadUrl('abc')).toBe('https://drive.google.com/uc?export=download&id=abc');
  });

  it('openInDriveUrl formats correctly', () => {
    expect(openInDriveUrl('abc')).toBe('https://drive.google.com/file/d/abc/view');
  });
});
