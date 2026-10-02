import { describe, it, expect } from 'vitest';
import { parseIsoDurationSeconds } from '../../src/logic/isoDuration';

describe('parseIsoDurationSeconds', () => {
  it.each([
    ['PT3M34S', 214],
    ['PT45S', 45],
    ['PT1H2M3S', 3723],
    ['PT10M', 600],
    ['PT1H', 3600],
    ['P0D', 0],
    ['', 0],
    ['garbage', 0]
  ])('reads %s as %i seconds', (input, expected) => {
    expect(parseIsoDurationSeconds(input)).toBe(expected);
  });
});
