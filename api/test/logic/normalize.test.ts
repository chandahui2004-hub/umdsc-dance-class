import { describe, it, expect } from 'vitest';
import {
  normalizeMatric,
  nameKey,
  normalizePhone,
  nameSimilarity,
  fullNameMatches
} from '../../src/logic/normalize';

describe('normalize', () => {
  it('normalizes matric numbers correctly', () => {
    expect(normalizeMatric('2.2003949E7')).toBe('22003949');
    expect(normalizeMatric(22003949)).toBe('22003949');
    expect(normalizeMatric(' 22004591/1 ')).toBe('22004591');
    expect(normalizeMatric('s2199647')).toBe('S2199647');
    expect(normalizeMatric('u2012-345')).toBe('U2012345');
    expect(normalizeMatric('')).toBe('');
  });

  it('generates name keys correctly', () => {
    expect(nameKey('  AHMAD Fiqri  bin Mohd  ')).toBe('ahmad fiqri bin mohd');
    expect(nameKey('José')).toBe('jose');
  });

  it('normalizes phone numbers and flags repaired ones', () => {
    expect(normalizePhone('1.37545173E8')).toEqual({ value: '0137545173', repaired: true });
    expect(normalizePhone('012-6015423')).toEqual({ value: '0126015423', repaired: false });
    expect(normalizePhone('0173303973')).toEqual({ value: '0173303973', repaired: false });
    expect(normalizePhone('+60 12-345 6789')).toEqual({ value: '60123456789', repaired: false });
  });

  it('calculates name similarity with token handling', () => {
    expect(nameSimilarity('AHMAD FIQRI BIN MOHD ZAMRI', 'ahmad fiqri mohd zamri')).toBeGreaterThanOrEqual(0.8);
    expect(nameSimilarity('Wong Jin Wui', 'Jin Wui Wong')).toBeGreaterThanOrEqual(0.8);
    expect(nameSimilarity('Yee Jia Xuan', 'Yee Jia Xuen')).toBeGreaterThanOrEqual(0.8);
    expect(nameSimilarity('Wong Jin Wui', 'Tan Mei Ling')).toBeLessThan(0.5);
    expect(nameSimilarity('Kumar a/l Ravi', 'Kumar Ravi')).toBeGreaterThanOrEqual(0.8);
  });

  describe('fullNameMatches', () => {
    const R = 'SARAH BINTI AHMAD';
    it.each([
      ['AHMAD', R, false], ['SARAH', R, false], ['SARAH BINTI', R, false],
      ['sarah ahmad', R, true], ['Ahmad Sarah', R, true], ['SARAH BINTI AHMAD', R, true],
      ['Sara Binti Ahmad', R, true], ['Sarah Ahmed', R, true], ['Sxrxh Ahmad', R, false],
      ['sarah ahmad nickname', R, true], ['', R, false], ['sarah', '', false],
      // Review Focus 1–3
      ['Muhammad Ali Abu Bakar', 'MUHAMMAD ALI BIN ABU BAKAR', true],
      ['raj kumar selvam', 'RAJ KUMAR A/L SELVAM', true],
      ['nurain zaki', "NUR'AIN BINTI ZAKI", true],
      ['nur aisyah', 'NUR NUR AISYAH', false],
      ['nur nur aisyah', 'NUR NUR AISYAH', true],
      ['tan ah kow', 'TAN AH KOW', true], ['tan ah', 'TAN AH KOW', false], ['tan ah kaw', 'TAN AH KOW', false],
    ])('fullNameMatches(%j, %j) = %s', (typed, registered, expected) => {
      expect(fullNameMatches(typed, registered)).toBe(expected);
    });
  });
});
