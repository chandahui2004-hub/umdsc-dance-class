import React, { useEffect, useState } from 'react';

export function CityBackdrop(): JSX.Element {
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPaused(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return (
    <div
      data-testid="city-backdrop"
      aria-hidden="true"
      className={`fixed inset-0 overflow-hidden pointer-events-none select-none z-[var(--z-sky)] ${isPaused ? 'px-paused' : ''}`}
      style={{ backgroundColor: 'var(--night-1)' }}
    >
      {/* Sky layer */}
      <div
        data-layer="sky"
        className="absolute inset-0 px-art"
        style={{
          backgroundImage: 'url(/art/a1-sky.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}
      />

      {/* Far layer */}
      <div data-layer="far" className="absolute bottom-[30%] left-0 w-full">
        <img
          src="/art/a2-far.webp"
          alt=""
          draggable={false}
          loading="eager"
          className="block lg:hidden w-[640px] max-w-none px-art px-drift-far"
        />
        <div
          className="hidden lg:block w-[calc(100%+384px)] h-[180px] px-art px-drift-far"
          style={{ background: 'url(/art/a2-far.webp) repeat-x bottom left / 960px auto' }}
        />
      </div>

      {/* Mid layer */}
      <div data-layer="mid" className="absolute bottom-[18%] left-0 w-full">
        <img
          src="/art/a3-mid.webp"
          alt=""
          draggable={false}
          loading="eager"
          className="block lg:hidden w-[640px] max-w-none px-art px-drift-mid"
        />
        <div
          className="hidden lg:block w-[calc(100%+384px)] h-[240px] px-art px-drift-mid"
          style={{ background: 'url(/art/a3-mid.webp) repeat-x bottom left / 960px auto' }}
        />
      </div>

      {/* Near layer */}
      <div data-layer="near" className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <img
          src="/art/a4-near.webp"
          alt=""
          draggable={false}
          loading="eager"
          className="block lg:hidden w-[390px] max-w-none px-art"
        />
        <img
          src="/art/a4-near.webp"
          alt=""
          draggable={false}
          loading="eager"
          className="hidden lg:block w-[585px] max-w-none px-art"
        />
      </div>
    </div>
  );
}
