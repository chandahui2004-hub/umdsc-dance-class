import { useState, useEffect } from 'react';

export type LayoutMode = 'phone' | 'desktop';

export function useLayout(): LayoutMode {
  const [layout, setLayout] = useState<LayoutMode>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return window.matchMedia('(min-width: 1024px)').matches ? 'desktop' : 'phone';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const updateLayout = (e: MediaQueryListEvent | MediaQueryList) => {
      setLayout(e.matches ? 'desktop' : 'phone');
    };

    updateLayout(mediaQuery);

    const listener = (e: MediaQueryListEvent) => updateLayout(e);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return layout;
}
