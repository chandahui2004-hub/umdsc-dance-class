import React, { useRef } from 'react';
import { monthGrid, addMonths, formatDayLabel, todayKL } from '../../lib/time';
import { getStyleColor } from '../../theme/colors';
import { PixelButton } from './PixelButton';
import type { Month, ISODate } from '@umdsc/shared';

export interface CalendarMark {
  colorKey: string;
  kind: 'present' | 'absent' | 'upcoming' | 'class';
  label?: string;
  className?: string;
  time?: string;
  instructorName?: string;
}

export interface MonthCalendarProps {
  month: Month;
  onMonthChange: (m: Month) => void;
  allowedMonths?: Month[];
  marks?: Record<ISODate, CalendarMark[]>;
  selected?: ISODate;
  onSelect?: (d: ISODate) => void;
  /** A small control under the month name, e.g. the admin's + ADD CLASS. */
  action?: React.ReactNode;
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
  onSelect,
  action
}) => {
  const [hoveredDate, setHoveredDate] = React.useState<ISODate | null>(null);
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

        <div className="flex flex-col items-center gap-2">
          <h2
            className="font-display text-[12px] md:text-[16px] text-[var(--text-1)] tracking-wider px-glow-text"
            style={{ '--glow': 'var(--neon-cyan)' } as React.CSSProperties}
          >
            {monthTitle}
          </h2>
          {action}
        </div>

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
            className="font-display text-[11px] md:text-[12px] font-bold text-[var(--text-2)] py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid Days */}
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {grid.flat().map((dateStr, index) => {
          const isCurrentMonth = dateStr.startsWith(month);
          const isSelected = dateStr === selected;
          const isToday = dateStr === today;
          const dayNum = parseInt(dateStr.split('-')[2], 10);
          const dayMarks = marks[dateStr] || [];
          const isHovered = hoveredDate === dateStr;
          const colIndex = index % 7;
          const rowIndex = Math.floor(index / 7);

          const markLabels = dayMarks
            .map((m) => m.label || m.kind)
            .filter(Boolean);
          const ariaLabel = `${formatDayLabel(dateStr)}${
            markLabels.length > 0 ? ' - ' + markLabels.join(', ') : ''
          }`;

          return (
            <div key={dateStr} className="relative">
              <button
                type="button"
                data-date={dateStr}
                aria-label={ariaLabel}
                onClick={() => onSelect?.(dateStr)}
                onKeyDown={(e) => handleKeyDown(e, dateStr)}
                onMouseEnter={() => setHoveredDate(dateStr)}
                onMouseLeave={() => setHoveredDate(null)}
                onFocus={() => setHoveredDate(dateStr)}
                onBlur={() => setHoveredDate(null)}
                aria-pressed={isSelected}
                data-today={isToday || undefined}
                style={isToday ? ({ '--glow': 'var(--neon-cyan)' } as React.CSSProperties) : undefined}
                className={`w-full px-well min-h-[44px] min-w-[44px] p-1 flex flex-col justify-between items-center transition-none font-display text-[12px] md:text-[14px] cursor-pointer focus:outline-none ${
                  isToday ? 'px-neon' : ''
                } ${
                  isSelected
                    ? // Selected: pink inset frame, pressed down (today keeps its cyan glow around it)
                      'bg-[var(--violet-2)] border-[var(--neon-pink)] shadow-[inset_0_0_0_2px_var(--neon-pink),inset_3px_3px_0_var(--night-0)] translate-x-[2px] translate-y-[2px]'
                    : isToday
                    ? 'border-[var(--neon-cyan)]'
                    : isCurrentMonth
                    ? 'hover:bg-[var(--violet-1)] active:translate-y-[2px]'
                    : 'opacity-30'
                }`}
              >
                {/* Day Number */}
                <span
                  className={`text-[12px] md:text-[14px] font-bold leading-none ${
                    isCurrentMonth ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'
                  }`}
                >
                  {dayNum}
                </span>

                {/* Coloured Markers (up to 4 square dots) */}
                <div className="flex gap-1 flex-wrap justify-center w-full min-h-[6px]">
                  {dayMarks.slice(0, 4).map((m, idx) => {
                    const colorVar = getStyleColor(m.colorKey);
                    return (
                      <span
                        key={idx}
                        data-marker="true"
                        style={{ backgroundColor: colorVar }}
                        className="w-1.5 h-1.5 inline-block border border-[var(--outline)] flex-shrink-0"
                        title={m.label || m.kind}
                      />
                    );
                  })}
                </div>
              </button>

              {/* Hover Tooltip showing class name, time, and instructor */}
              {isHovered && dayMarks.length > 0 && (
                <div
                  role="tooltip"
                  className={`absolute z-50 pointer-events-none min-w-[180px] max-w-[260px] p-2 bg-[var(--night-2)] border-2 border-[var(--neon-cyan)] shadow-[3px_3px_0_var(--outline)] text-left ${
                    colIndex === 0
                      ? 'left-0'
                      : colIndex === 6
                      ? 'right-0'
                      : 'left-1/2 -translate-x-1/2'
                  } ${
                    rowIndex < 2
                      ? 'top-[calc(100%+6px)]'
                      : 'bottom-[calc(100%+6px)]'
                  }`}
                >
                  <div className="font-display text-[11px] text-[var(--neon-gold)] tracking-wider border-b border-[var(--outline)] pb-1 mb-1.5 uppercase font-bold">
                    {formatDayLabel(dateStr)}
                  </div>
                  <div className="space-y-1.5">
                    {dayMarks.map((m, mIdx) => (
                      <div key={mIdx} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--text-1)]">
                          <span
                            className="w-2 h-2 inline-block border border-[var(--outline)] shrink-0"
                            style={{ backgroundColor: getStyleColor(m.colorKey) }}
                          />
                          <span className="truncate">{m.className || m.label || 'Dance Class'}</span>
                        </div>
                        {(m.time || m.instructorName) && (
                          <div className="text-[13px] text-[var(--text-2)] font-mono pl-3.5 flex flex-col gap-0.5">
                            {m.time && <span>⏰ {m.time}</span>}
                            {m.instructorName && <span>👤 {m.instructorName}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
