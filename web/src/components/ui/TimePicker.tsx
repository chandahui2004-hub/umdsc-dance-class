import React from 'react';
import { PixelButton } from './PixelButton';
import type { HHmm } from '@umdsc/shared';

export interface TimePickerProps {
  value: HHmm;
  onChange: (v: HHmm) => void;
  stepMinutes?: number;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  stepMinutes = 15
}) => {
  const [hoursStr, minutesStr] = (value || '20:00').split(':');
  const hours = parseInt(hoursStr, 10) || 0;
  const minutes = parseInt(minutesStr, 10) || 0;

  const emit = (h: number, m: number) => {
    const formattedH = String((h + 24) % 24).padStart(2, '0');
    const formattedM = String((m + 60) % 60).padStart(2, '0');
    onChange(`${formattedH}:${formattedM}`);
  };

  const changeHours = (delta: number) => {
    emit(hours + delta, minutes);
  };

  const changeMinutes = (delta: number) => {
    emit(hours, minutes + delta);
  };

  return (
    <div
      role="group"
      aria-label="Time Picker"
      className="inline-flex items-center gap-2 px-panel p-2"
    >
      {/* Hours Column */}
      <div className="flex flex-col items-center">
        <PixelButton
          variant="secondary"
          size="md"
          type="button"
          aria-label="Increment hours"
          onClick={() => changeHours(1)}
          className="min-h-[44px] min-w-[44px] px-2"
        >
          ▲
        </PixelButton>

        <span
          aria-label="Hours"
          className="font-mono text-xl md:text-2xl text-[var(--text-1)] my-1 select-none font-bold"
        >
          {String(hours).padStart(2, '0')}
        </span>

        <PixelButton
          variant="secondary"
          size="md"
          type="button"
          aria-label="Decrement hours"
          onClick={() => changeHours(-1)}
          className="min-h-[44px] min-w-[44px] px-2"
        >
          ▼
        </PixelButton>
      </div>

      <span className="font-mono text-2xl text-[var(--text-1)] font-bold pb-1">:</span>

      {/* Minutes Column */}
      <div className="flex flex-col items-center">
        <PixelButton
          variant="secondary"
          size="md"
          type="button"
          aria-label="Increment minutes"
          onClick={() => changeMinutes(stepMinutes)}
          className="min-h-[44px] min-w-[44px] px-2"
        >
          ▲
        </PixelButton>

        <span
          aria-label="Minutes"
          className="font-mono text-xl md:text-2xl text-[var(--text-1)] my-1 select-none font-bold"
        >
          {String(minutes).padStart(2, '0')}
        </span>

        <PixelButton
          variant="secondary"
          size="md"
          type="button"
          aria-label="Decrement minutes"
          onClick={() => changeMinutes(-stepMinutes)}
          className="min-h-[44px] min-w-[44px] px-2"
        >
          ▼
        </PixelButton>
      </div>
    </div>
  );
};
