import { describe, it, expect } from 'vitest';
import { getStyleColor, getInstructorColor } from './colors';

describe('colors theme utilities', () => {
  it('handles standard predefined color keys', () => {
    expect(getStyleColor('blue')).toBe('var(--c-blue)');
    expect(getStyleColor('orange')).toBe('var(--c-orange)');
    expect(getStyleColor('pink')).toBe('var(--c-pink)');
    expect(getStyleColor('green')).toBe('var(--c-green)');
  });

  it('supports custom hex colors directly without falling back to ink', () => {
    expect(getStyleColor('#FF5500')).toBe('#FF5500');
    expect(getStyleColor('#e91e63')).toBe('#e91e63');
    expect(getStyleColor('#123456')).toBe('#123456');
  });

  it('resolves instructor signature color with getInstructorColor', () => {
    expect(getInstructorColor({ color: '#FF5500' })).toBe('#FF5500');
    expect(getInstructorColor({ color: 'pink' })).toBe('var(--c-pink)');
    expect(getInstructorColor(null)).toBe('var(--neon-orange)');
    expect(getInstructorColor(undefined)).toBe('var(--neon-orange)');
    expect(getInstructorColor({ color: '' })).toBe('var(--neon-orange)');
  });

  it('resolves instructor per-style colors when styleId is provided', () => {
    const instructor = {
      color: '#FF5500',
      styleColors: {
        st_popping: '#00E5FF',
        st_hiphop: '#FF007F'
      }
    };
    expect(getInstructorColor(instructor, 'st_popping')).toBe('#00E5FF');
    expect(getInstructorColor(instructor, 'st_hiphop')).toBe('#FF007F');
    expect(getInstructorColor(instructor, 'st_locking')).toBe('#FF5500');
    expect(getInstructorColor({ styleColors: {} }, 'st_locking', 'var(--neon-gold)')).toBe('var(--neon-gold)');
  });

  it('falls back to default ink when colorKey is empty or missing', () => {
    expect(getStyleColor('')).toBe('var(--c-ink)');
    expect(getStyleColor(undefined)).toBe('var(--c-ink)');
  });
});
