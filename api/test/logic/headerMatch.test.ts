import { describe, it, expect } from 'vitest';
import { matchHeaders } from '../../src/logic/headerMatch';
import { REAL_FORM_HEADERS, MALAY_FORM_HEADERS } from '../fixtures/formHeaders';

describe('Header Matching (logic/headerMatch)', () => {
  it('matches real Google Form registration headers accurately', () => {
    const res = matchHeaders(REAL_FORM_HEADERS);
    expect(res.map).toEqual({
      email: 1,
      fullName: 2,
      matric: 3,
      contact: 4,
      gender: 5,
      nationality: 9
    });
    expect(res.scores.fullName).toBeGreaterThanOrEqual(0.6);
    expect(res.scores.matric).toBeGreaterThanOrEqual(0.6);
  });

  it('matches Malay / multilingual form headers', () => {
    const res = matchHeaders(MALAY_FORM_HEADERS);
    expect(res.map).toEqual({
      fullName: 0,
      matric: 1,
      contact: 2,
      gender: 3,
      nationality: 4,
      email: 5
    });
  });

  it('matches short headers like Name, Student ID, WhatsApp No', () => {
    const res = matchHeaders(['Name', 'Student ID', 'WhatsApp No']);
    expect(res.map.fullName).toBe(0);
    expect(res.map.matric).toBe(1);
    expect(res.map.contact).toBe(2);
  });

  it('returns null for unmatchable fields', () => {
    const res = matchHeaders(['Faculty', 'Year']);
    expect(res.map.fullName).toBeNull();
    expect(res.map.matric).toBeNull();
    expect(res.map.contact).toBeNull();
    expect(res.map.email).toBeNull();
  });
});
