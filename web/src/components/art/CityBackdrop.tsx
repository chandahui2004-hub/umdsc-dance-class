import { useEffect, useState, type ReactElement } from 'react';

export function CityBackdrop(): ReactElement {
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
      >
        {/* Pixel Crescent Moon: compact, crisp, high in the open sky */}
        <div
          data-layer="moon"
          className="absolute top-6 left-6 md:top-8 md:left-12 select-none pointer-events-none drop-shadow-[0_0_12px_rgba(244,236,255,0.35)]"
        >
          <img
            src="/art/a1-moon.webp"
            alt=""
            draggable={false}
            loading="eager"
            className="w-12 h-12 md:w-16 md:h-16 px-art"
          />
        </div>
      </div>

      {/* Far layer - enlarged to fully cover cloud band */}
      <div data-layer="far" className="absolute bottom-[26%] md:bottom-[24%] left-0 w-full">
        <img
          src="/art/a2-far.webp"
          alt=""
          draggable={false}
          loading="eager"
          className="block lg:hidden w-[640px] max-w-none px-art px-drift-far"
        />
        <div
          className="hidden lg:block w-[calc(100%+384px)] h-[220px] px-art px-drift-far"
          style={{ background: 'url(/art/a2-far.webp) repeat-x bottom left / 920px auto' }}
        />
      </div>

      {/* Mid layer - enlarged to cover cloud band */}
      <div data-layer="mid" className="absolute bottom-[14%] md:bottom-[12%] left-0 w-full">
        <img
          src="/art/a3-mid.webp"
          alt=""
          draggable={false}
          loading="eager"
          className="block lg:hidden w-[640px] max-w-none px-art px-drift-mid"
        />
        <div
          className="hidden lg:block w-[calc(100%+384px)] h-[260px] px-art px-drift-mid"
          style={{ background: 'url(/art/a3-mid.webp) repeat-x bottom left / 920px auto' }}
        />
      </div>

      {/* Near layer - anchored at bottom */}
      <div data-layer="near" className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <img
          src="/art/a4-near.webp"
          alt=""
          draggable={false}
          loading="eager"
          className="block lg:hidden w-[320px] max-w-none px-art opacity-90"
        />
        <img
          src="/art/a4-near.webp"
          alt=""
          draggable={false}
          loading="eager"
          className="hidden lg:block w-[460px] max-w-none px-art opacity-90"
        />
      </div>
    </div>
  );
}
