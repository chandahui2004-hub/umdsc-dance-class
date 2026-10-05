import { describe, it, expect } from 'vitest';
import { can } from './permissions';

describe('can permission helper', () => {
  it('returns false for null/undefined perms or missing code', () => {
    expect(can(undefined, 'styles.edit')).toBe(false);
    expect(can(null, 'styles.edit')).toBe(false);
    expect(can({}, 'styles.edit')).toBe(false);
  });

  it('returns true when permission is wildcard "*"', () => {
    expect(can({ 'styles.edit': '*' }, 'styles.edit')).toBe(true);
    expect(can({ 'styles.edit': '*' }, 'styles.edit', 'st_hiphop')).toBe(true);
  });

  it('handles array permissions for style-scoped permissions', () => {
    expect(can({ 'styles.edit': ['st_hiphop'] }, 'styles.edit')).toBe(true);
    expect(can({ 'styles.edit': ['st_hiphop'] }, 'styles.edit', 'st_hiphop')).toBe(true);
    expect(can({ 'styles.edit': ['st_hiphop'] }, 'styles.edit', 'st_popping')).toBe(false);
    expect(can({ 'styles.edit': [] }, 'styles.edit')).toBe(false);
  });
});
