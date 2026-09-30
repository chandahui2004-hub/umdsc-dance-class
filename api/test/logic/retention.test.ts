import { describe, it, expect } from 'vitest';
import { RETENTION_YEARS, addYearsClamped, isDue, anonymizedMemberId } from '../../src/logic/retention';

describe('logic/retention', () => {
  it('keeps data for 3 years after the last event ends', () => {
    expect(RETENTION_YEARS).toBe(3);
    expect(isDue('2023-09-29', '2026-09-30')).toBe(true);
    expect(isDue('2023-09-30', '2026-09-30')).toBe(false);
  });

  it('clamps 29 February to 28 February', () => {
    expect(addYearsClamped('2024-02-29', 3)).toBe('2027-02-28');
    expect(isDue('2024-02-29', '2027-02-28')).toBe(false);
    expect(isDue('2024-02-29', '2027-03-01')).toBe(true);
  });

  it('a blank last-event date is never due', () => {
    expect(isDue('', '2030-01-01')).toBe(false);
  });

  it('anonymized member ids are X- plus 10 characters', () => {
    expect(anonymizedMemberId()).toMatch(/^X-[A-Za-z0-9]{10}$/);
    expect(anonymizedMemberId()).not.toBe(anonymizedMemberId());
  });
});
