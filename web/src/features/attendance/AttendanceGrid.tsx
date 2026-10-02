import React from 'react';
import type { ClassSession } from '@umdsc/shared';
import { formatDayLabel } from '../../lib/time';
import type { RosterMember } from './RosterList';

interface AttendanceGridProps {
  sessions: ClassSession[];
  members: RosterMember[];
  presentMap: Record<string, string[]>; // memberId -> sessionId[]
  onToggle: (memberId: string, sessionId: string, present: boolean) => void;
  readOnly?: boolean;
  containerClassName?: string;
}

export const AttendanceGrid: React.FC<AttendanceGridProps> = ({
  sessions,
  members,
  presentMap,
  onToggle,
  readOnly = false,
  containerClassName
}) => {
  if (sessions.length === 0) {
    return (
      <div className="p-8 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] text-center shadow-[4px_4px_0_var(--c-ink)]">
        <p className="font-display text-sm text-[var(--c-red)]">
          NO SESSIONS SCHEDULED FOR THIS MONTH
        </p>
        <p className="font-body text-base text-[var(--c-darkgrey)] mt-2">
          Use the Calendar to schedule class sessions first.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        containerClassName ||
        'overflow-auto max-h-[600px] pixel-scrollbar border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] bg-[var(--c-panel)]'
      }
    >
      <table
        data-testid="attendance-grid"
        className="w-full text-left font-body border-collapse min-w-[700px]"
      >
        <thead className="sticky top-0 z-30 bg-[var(--c-bg)] shadow-[0_2px_0_var(--c-ink)]">
          <tr className="border-b-4 border-[var(--c-ink)] bg-[var(--c-bg)] font-display text-xs text-[var(--c-ink)]">
            <th className="sticky top-0 left-0 z-40 bg-[var(--c-bg)] p-3 border-r-2 border-[var(--c-ink)] min-w-[220px]">
              DANCER NAME / MATRIC
            </th>
            {sessions.map((s) => (
              <th
                key={s.id}
                className="p-3 border-r-2 border-[var(--c-ink)] text-center min-w-[90px] bg-[var(--c-bg)]"
              >
                <div>#{s.seq}</div>
                <div className="font-mono text-[10px] min-text-5px text-[var(--c-darkgrey)]">
                  {formatDayLabel(s.date).slice(4)}
                </div>
              </th>
            ))}
            <th className="p-3 text-center min-w-[80px] bg-[var(--c-bg)]">TOTAL</th>
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-[var(--c-ink)]">
          {members.length === 0 ? (
            <tr>
              <td
                colSpan={sessions.length + 2}
                className="p-6 text-center text-sm font-body text-[var(--c-darkgrey)]"
              >
                No dancers registered for this style in this month.
              </td>
            </tr>
          ) : (
            members.map((m) => {
              const attendedList = presentMap[m.memberId] || [];
              const attendedCount = sessions.filter((s) => attendedList.includes(s.id)).length;

              return (
                <tr key={m.memberId} className="hover:bg-[var(--c-bg)]/50 transition-none">
                  <td className="sticky left-0 z-10 bg-[var(--c-panel)] p-3 border-r-2 border-[var(--c-ink)]">
                    <div className="font-display text-xs text-[var(--c-ink)] font-bold truncate">
                      {m.fullName}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--c-darkgrey)]">
                      {m.matric}
                    </div>
                  </td>

                  {sessions.map((s) => {
                    const isPresent = attendedList.includes(s.id);
                    const cellKey = `${m.memberId}:${s.id}`;

                    return (
                      <td
                        key={s.id}
                        data-cell={cellKey}
                        onClick={readOnly ? undefined : () => onToggle(m.memberId, s.id, !isPresent)}
                        className={`p-2 border-r-2 border-[var(--c-ink)] text-center select-none min-h-[44px] transition-none ${
                          readOnly ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          isPresent
                            ? `bg-[var(--c-green)]/40 text-[var(--c-ink)] ${readOnly ? '' : 'hover:bg-[var(--c-green)]/60'}`
                            : `text-[var(--c-grey)] ${readOnly ? '' : 'hover:bg-[var(--c-bg)]'}`
                        }`}
                      >
                        <div className="w-8 h-8 mx-auto flex items-center justify-center font-display text-sm border-2 border-[var(--c-ink)] shadow-[1px_1px_0_var(--c-ink)]">
                          {isPresent ? (
                            <span className="font-bold text-[var(--c-ink)]">✓</span>
                          ) : (
                            <span className="opacity-0">·</span>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="p-3 text-center font-mono text-xs font-bold text-[var(--c-navy)]">
                    {attendedCount}/{sessions.length}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
