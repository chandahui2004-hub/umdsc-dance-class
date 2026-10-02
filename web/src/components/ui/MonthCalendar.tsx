import React, { useRef } from 'react';
import { monthGrid, addMonths, formatDayLabel, todayKL } from '../../lib/time';
import { STYLE_COLOR } from '../../theme/colors';
import { PixelButton } from './PixelButton';
import type { Month, ISODate } from '@umdsc/shared';

export interface CalendarMark {
  colorKey: string;
  kind: 'present' | 'absent' | 'upcoming' | 'class';
  label?: string;
}

export interface MonthCalendarProps {
  month: Month;
  onMonthChange: (m: Month) => void;
  allowedMonths?: Month[];
  marks?: Record<ISODate, CalendarMark[]>;
  selected?: ISODate;
  onSelect?: (d: ISODate) => void;
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

export const MonthCalendar: React.FC<MonthCalendarProps> = ({
  month,
  onMonthChange,
  allowedMonths,
  marks = {},
  selected,
  onSelect
}) => {
  const grid = monthGrid(month);
  const today = todayKL();
  const [yearStr, monthStr] = month.split('-');
  const monthIndex = parseInt(monthStr, 10) - 1;
  const monthTitle = `${MONTH_NAMES[monthIndex]} ${yearStr}`;

  const prevMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);

  const canGoPrev = !allowedMonths || allowedMonths.includes(prevMonth);
  const canGoNext = !allowedMonths || allowedMonths.includes(nextMonth);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent, currentDate: ISODate) => {
    if (!onSelect) return;
    const [y, m, d] = currentDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));

    let deltaDays = 0;
    if (e.key === 'ArrowLeft') deltaDays = -1;
    else if (e.key === 'ArrowRight') deltaDays = 1;
    else if (e.key === 'ArrowUp') deltaDays = -7;
    else if (e.key === 'ArrowDown') deltaDays = 7;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(currentDate);
      return;
    }

    if (deltaDays !== 0) {
      e.preventDefault();
      dateObj.setUTCDate(dateObj.getUTCDate() + deltaDays);
      const nextY = dateObj.getUTCFullYear();
      const nextM = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const nextD = String(dateObj.getUTCDate()).padStart(2, '0');
      const nextIso = `${nextY}-${nextM}-${nextD}`;

      const targetMonth = `${nextY}-${nextM}`;
      if (targetMonth !== month) {
        if (!allowedMonths || allowedMonths.includes(targetMonth)) {
          onMonthChange(targetMonth);
        }
      }
      onSelect(nextIso);

      // Focus the new tile after state update
      setTimeout(() => {
        const nextBtn = containerRef.current?.querySelector<HTMLButtonElement>(`[data-date="${nextIso}"]`);
        nextBtn?.focus();
      }, 0);
    }
  };

  return (
    <div
      ref={containerRef}
      className="px-panel px-corners p-3 md:p-4 select-none w-full"
    >
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-[var(--outline)]">
        <div>
          {canGoPrev && (
            <PixelButton
              variant="secondary"
              size="md"
              aria-label="Previous Month"
              onClick={() => onMonthChange(prevMonth)}
            >
              &lt;
            </PixelButton>
          )}
        </div>

        <h2
          className="font-display text-[12px] md:text-[16px] text-[var(--text-1)] tracking-wider px-glow-text"
          style={{ '--glow': 'var(--neon-cyan)' } as React.CSSProperties}
        >
          {monthTitle}
        </h2>

        <div>
          {canGoNext && (
            <PixelButton
              variant="secondary"
              size="md"
              aria-label="Next Month"
              onClick={() => onMonthChange(nextMonth)}
            >
              &gt;
            </PixelButton>
          )}
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 text-center">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="font-display text-[8px] text-[var(--text-2)] py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid Days */}
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {grid.flat().map((dateStr) => {
          const isCurrentMonth = dateStr.startsWith(month);
          const isSelected = dateStr === selected;
          const isToday = dateStr === today;
          const dayNum = parseInt(dateStr.split('-')[2], 10);
          const dayMarks = marks[dateStr] || [];

          const markLabels = dayMarks
            .map((m) => m.label || m.kind)
            .filter(Boolean);
          const ariaLabel = `${formatDayLabel(dateStr)}${
            markLabels.length > 0 ? ' - ' + markLabels.join(', ') : ''
          }`;

          return (
            <button
              key={dateStr}
              type="button"
              data-date={dateStr}
              aria-label={ariaLabel}
              onClick={() => onSelect?.(dateStr)}
              onKeyDown={(e) => handleKeyDown(e, dateStr)}
              style={isToday && !isSelected ? ({ '--glow': 'var(--neon-cyan)' } as React.CSSProperties) : undefined}
              className={`px-well min-h-[44px] min-w-[44px] p-1 flex flex-col justify-between items-center transition-none font-display text-[8px] md:text-[12px] cursor-pointer focus:outline-none ${
                isSelected
                  ? 'bg-[var(--violet-2)] border-[var(--neon-gold)] shadow-[2px_2px_0_var(--outline)]'
                  : isToday
                  ? 'border-[var(--neon-cyan)] px-neon'
                  : isCurrentMonth
                  ? 'hover:bg-[var(--violet-1)]'
                  : 'opacity-30'
              }`}
            >
              {/* Day Number */}
              <span
                className={`text-[8px] md:text-[12px] leading-none ${
                  isCurrentMonth ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'
                }`}
              >
                {dayNum}
              </span>

              {/* Coloured Markers (up to 4 square dots) */}
              <div className="flex gap-1 flex-wrap justify-center w-full min-h-[4px]">
                {dayMarks.slice(0, 4).map((m, idx) => {
                  const colorVar = m.colorKey?.startsWith('#')
                    ? m.colorKey
                    : (STYLE_COLOR[m.colorKey?.toLowerCase()] || `var(--c-${m.colorKey})`);
                  return (
                    <span
                      key={idx}
                      data-marker="true"
                      style={{ backgroundColor: colorVar }}
                      className="w-1 h-1 inline-block border-none"
                      title={m.label || m.kind}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
