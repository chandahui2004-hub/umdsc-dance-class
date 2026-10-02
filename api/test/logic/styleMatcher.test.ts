import { describe, it, expect } from 'vitest';
import { isMemberEnrolledInStyle } from '../../src/logic/styleMatcher';

describe('isMemberEnrolledInStyle', () => {
  const styles = [
    { id: 'st_locking', name: 'Locking', aliases: ['locking'] },
    { id: 'st_popping', name: 'Popping', aliases: ['popping'] },
    { id: 'st_hiphop', name: 'Hip Hop', aliases: ['hip hop', 'hiphop', 'hip-hop'] },
    { id: 'st_latin', name: 'Latin', aliases: ['latin'] }
  ];

  it('matches by exact styleId', () => {
    expect(isMemberEnrolledInStyle({ styleIds: ['st_locking'] }, 'st_locking', styles)).toBe(true);
    expect(isMemberEnrolledInStyle({ styleIds: ['st_locking'] }, 'st_popping', styles)).toBe(false);
  });

  it('matches styleId when member only has styleNames', () => {
    expect(isMemberEnrolledInStyle({ styleNames: ['Locking'] }, 'st_locking', styles)).toBe(true);
    expect(isMemberEnrolledInStyle({ styleNames: ['Latin'] }, 'st_latin', styles)).toBe(true);
    expect(isMemberEnrolledInStyle({ styleNames: ['Latin'] }, 'st_locking', styles)).toBe(false);
  });

  it('matches styleName when member only has styleIds', () => {
    expect(isMemberEnrolledInStyle({ styleIds: ['st_locking'] }, 'Locking', styles)).toBe(true);
    expect(isMemberEnrolledInStyle({ styleIds: ['st_latin'] }, 'Latin', styles)).toBe(true);
  });

  it('matches aliases and case-insensitivity', () => {
    expect(isMemberEnrolledInStyle({ styleNames: ['hip hop'] }, 'st_hiphop', styles)).toBe(true);
    expect(isMemberEnrolledInStyle({ styleNames: ['Hiphop'] }, 'st_hiphop', styles)).toBe(true);
    expect(isMemberEnrolledInStyle({ styleNames: ['Locking Class (Thu)'] }, 'st_locking', styles)).toBe(true);
  });

  it('returns false when member has no matching styles or empty tokens', () => {
    expect(isMemberEnrolledInStyle({}, 'st_locking', styles)).toBe(false);
    expect(isMemberEnrolledInStyle({ styleIds: [] }, 'st_locking', styles)).toBe(false);
    expect(isMemberEnrolledInStyle({ styleIds: ['st_popping'] }, 'st_locking', styles)).toBe(false);
  });
});
