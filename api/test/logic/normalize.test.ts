import { describe, it, expect } from 'vitest';
import {
  normalizeMatric,
  nameKey,
  normalizePhone,
  nameSimilarity
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
});
