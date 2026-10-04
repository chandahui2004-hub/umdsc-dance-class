import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOverlayOpen } from './useOverlayOpen';

describe('useOverlayOpen', () => {
  beforeEach(() => {
    delete document.body.dataset.overlays;
  });

  it('sets data-overlays while active and removes it on unmount', () => {
    const { unmount } = renderHook(() => useOverlayOpen(true));
    expect(document.body.dataset.overlays).toBe('1');
    unmount();
    expect(document.body.dataset.overlays).toBeUndefined();
  });

  it('two overlays: closing one keeps the attribute, closing both removes it', () => {
    const hook1 = renderHook(() => useOverlayOpen(true));
    expect(document.body.dataset.overlays).toBe('1');

    const hook2 = renderHook(() => useOverlayOpen(true));
    expect(document.body.dataset.overlays).toBe('2');

    hook1.unmount();
    expect(document.body.dataset.overlays).toBe('1');

    hook2.unmount();
    expect(document.body.dataset.overlays).toBeUndefined();
  });

  it('switching active from true to false removes it', () => {
    const { rerender } = renderHook(({ active }) => useOverlayOpen(active), {
      initialProps: { active: true }
    });
    expect(document.body.dataset.overlays).toBe('1');

    rerender({ active: false });
    expect(document.body.dataset.overlays).toBeUndefined();
  });
});
