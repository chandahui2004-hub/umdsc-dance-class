import React, { useState, useEffect } from 'react';
import { toZonedTime, format as formatTz } from 'date-fns-tz';

const TIMEZONE = 'Asia/Kuala_Lumpur';

export interface LiveClockProps {
  compact?: boolean;
  showDate?: boolean;
  className?: string;
}

export const LiveClock: React.FC<LiveClockProps> = ({
  compact = false,
  showDate = true,
  className = ''
}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const zoned = toZonedTime(now, TIMEZONE);
  const timeStr = formatTz(zoned, 'HH:mm:ss', { timeZone: TIMEZONE });
  const dateStr = formatTz(zoned, 'EEE, dd MMM yyyy', { timeZone: TIMEZONE });

  if (compact) {
    return (
      <div
        data-testid="live-clock-compact"
        title={`Kuala Lumpur Time (UTC+8): ${dateStr} ${timeStr}`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 bg-[var(--c-ink)] text-[var(--c-yellow)] font-mono text-xs tracking-wider border-2 border-[var(--c-ink)] select-none shadow-[2px_2px_0_var(--c-ink)] ${className}`}
      >
        <span className="text-[10px]" aria-hidden="true">⏰</span>
        <span className="font-bold">{timeStr}</span>
      </div>
    );
  }

  return (
    <div
      data-testid="live-clock"
      aria-label={`Current Time: ${timeStr}, ${dateStr}`}
      className={`bg-[var(--c-ink)] text-[var(--c-yellow)] p-2.5 border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] font-mono select-none ${className}`}
    >
      <div className="flex items-center justify-between text-xs tracking-wider">
        <span className="flex items-center gap-1.5 font-bold">
          <span className="text-xs" aria-hidden="true">⏰</span>
          <span className="text-sm font-bold text-[var(--c-yellow)] tracking-widest">{timeStr}</span>
        </span>
        <span className="text-[8px] uppercase px-1.5 py-0.5 bg-[var(--c-navy)] text-[var(--c-peach)] border border-[var(--c-yellow)] font-display">
          KL (UTC+8)
        </span>
      </div>
      {showDate && (
        <div className="text-[11px] text-[var(--c-peach)] mt-1 tracking-wide flex items-center justify-between border-t border-[var(--c-darkgrey)] pt-1">
          <span>{dateStr}</span>
        </div>
      )}
    </div>
  );
};
