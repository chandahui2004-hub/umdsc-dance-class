import { useEffect } from 'react';

let overlayCount = 0;
type OverlayListener = (count: number) => void;
const overlayListeners = new Set<OverlayListener>();

export function subscribeOverlayOpen(fn: OverlayListener): () => void {
  overlayListeners.add(fn);
  return () => {
    overlayListeners.delete(fn);
  };
}

export function getOverlayCount(): number {
  return overlayCount;
}

function syncDataset() {
  if (typeof document !== 'undefined') {
    if (overlayCount > 0) {
      document.body.dataset.overlays = String(overlayCount);
    } else {
      delete document.body.dataset.overlays;
    }
  }
  overlayListeners.forEach(fn => fn(overlayCount));
}

/**
 * Tracks open overlays by maintaining a module-level counter and reflecting
 * it onto document.body.dataset.overlays. While at least one overlay is open,
 * data-overlays attribute exists with the count. When 0, the attribute is removed.
 */
export function useOverlayOpen(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    overlayCount++;
    syncDataset();

    return () => {
      overlayCount = Math.max(0, overlayCount - 1);
      syncDataset();
    };
  }, [active]);
}
