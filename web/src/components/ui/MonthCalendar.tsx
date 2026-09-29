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
      className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-3 md:p-4 select-none w-full"
    >
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b-4 border-[var(--c-ink)]">
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

        <h2 className="font-display text-sm md:text-base text-[var(--c-ink)] tracking-wider">
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
            className="font-display text-[10px] md:text-xs text-[var(--c-darkgrey)] py-1"
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
              className={`min-h-[44px] min-w-[44px] p-1 flex flex-col justify-between items-center border-2 border-[var(--c-ink)] transition-none font-display text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-yellow)] ${
                isSelected
                  ? 'bg-[var(--c-yellow)] shadow-[2px_2px_0_var(--c-ink)]'
                  : isToday
                  ? 'bg-[var(--c-peach)]'
                  : isCurrentMonth
                  ? 'bg-[var(--c-panel)] hover:bg-[var(--c-bg)]'
                  : 'bg-[var(--c-bg)] opacity-40'
              }`}
            >
              {/* Day Number */}
              <span
                className={`text-[10px] md:text-xs leading-none ${
                  isCurrentMonth ? 'text-[var(--c-ink)]' : 'text-[var(--c-darkgrey)]'
                }`}
              >
                {dayNum}
              </span>

              {/* Coloured Markers */}
              <div className="flex gap-1 flex-wrap justify-center w-full min-h-[8px]">
                {dayMarks.map((m, idx) => {
                  const colorVar = STYLE_COLOR[m.colorKey] || `var(--c-${m.colorKey})`;
                  return (
                    <span
                      key={idx}
                      data-marker="true"
                      style={{ backgroundColor: colorVar }}
                      className="w-2 h-2 inline-block border border-[var(--c-ink)]"
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
