import { describe, it, expect } from 'vitest';
import { parseDateFromName } from '../../src/logic/filenameDate';

const OCT = { startDate: '2026-10-01', endDate: '2026-10-31' };
const NEW_YEAR = { startDate: '2026-12-15', endDate: '2027-01-15' };

describe('Logic: parseDateFromName', () => {
  it('parses YYYY-MM-DD format', () => {
    expect(parseDateFromName('2026-10-07 Popping.mp4', OCT)).toBe('2026-10-07');
  });

  it('parses DD-MM-YYYY format', () => {
    expect(parseDateFromName('07-10-2026 class.mp4', OCT)).toBe('2026-10-07');
  });

  it('parses D/M or DD/MM format with month', () => {
    expect(parseDateFromName('VID 7/10.mp4', OCT)).toBe('2026-10-07');
    expect(parseDateFromName('08/10 popping.mp4', OCT)).toBe('2026-10-08');
  });

  it('parses D Mon or DD Mon format', () => {
    expect(parseDateFromName('Popping 7 Oct.mp4', OCT)).toBe('2026-10-07');
    expect(parseDateFromName('7 October Class.mp4', OCT)).toBe('2026-10-07');
  });

  it('parses YYYYMMDD timestamp format', () => {
    expect(parseDateFromName('20261007_203000.mp4', OCT)).toBe('2026-10-07');
  });

  it('returns null when the date is outside the event range', () => {
    expect(parseDateFromName('08/10 popping.mp4', NEW_YEAR)).toBeNull();
    expect(parseDateFromName('2026-11-02 class.mp4', OCT)).toBeNull();
  });

  it('picks the year that falls inside a range crossing new year', () => {
    expect(parseDateFromName('5 Jan class.mp4', NEW_YEAR)).toBe('2027-01-05');
    expect(parseDateFromName('20 Dec class.mp4', NEW_YEAR)).toBe('2026-12-20');
  });

  it('returns null for filenames without dates', () => {
    expect(parseDateFromName('IMG_4512.MOV', OCT)).toBeNull();
    expect(parseDateFromName('random_video.mp4', OCT)).toBeNull();
  });
});
