import { describe, it, expect } from 'vitest';
import { parseDateFromName } from '../../src/logic/filenameDate';

describe('Logic: parseDateFromName', () => {
  it('parses YYYY-MM-DD format', () => {
    expect(parseDateFromName('2026-10-07 Popping.mp4', '2026-10')).toBe('2026-10-07');
  });

  it('parses DD-MM-YYYY format', () => {
    expect(parseDateFromName('07-10-2026 class.mp4', '2026-10')).toBe('2026-10-07');
  });

  it('parses D/M or DD/MM format with month', () => {
    expect(parseDateFromName('VID 7/10.mp4', '2026-10')).toBe('2026-10-07');
  });

  it('parses D Mon or DD Mon format', () => {
    expect(parseDateFromName('Popping 7 Oct.mp4', '2026-10')).toBe('2026-10-07');
    expect(parseDateFromName('7 October Class.mp4', '2026-10')).toBe('2026-10-07');
  });

  it('parses YYYYMMDD timestamp format', () => {
    expect(parseDateFromName('20261007_203000.mp4', '2026-10')).toBe('2026-10-07');
  });

  it('returns null for filenames without dates', () => {
    expect(parseDateFromName('IMG_4512.MOV', '2026-10')).toBeNull();
    expect(parseDateFromName('random_video.mp4', '2026-10')).toBeNull();
  });
});
