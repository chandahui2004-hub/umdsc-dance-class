import React from 'react';
import type { ClassSession } from '@umdsc/shared';
import { formatDayLabel } from '../../lib/time';
import { EmptyState } from '../../components/ui/EmptyState';
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
      <EmptyState
        scene="rooftop"
        title="NO SESSIONS SCHEDULED"
        description="Use the Calendar to schedule class sessions first."
      />
    );
  }

  return (
    <div
      className={
        containerClassName ||
        'overflow-auto max-h-[600px] pixel-scrollbar border-4 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] bg-[var(--night-2)]'
      }
    >
      <table
        data-testid="attendance-grid"
        className="w-full text-left font-body border-collapse min-w-[700px]"
      >
        <thead className="sticky top-0 z-30 bg-[var(--night-2)] border-b-2 border-[var(--neon-cyan)] shadow-[0_2px_0_var(--outline)]">
          <tr className="border-b-2 border-[var(--neon-cyan)] bg-[var(--night-2)] font-display text-[12px] text-[var(--text-1)]">
            <th className="sticky top-0 left-0 z-40 bg-[var(--night-2)] p-3 border-r-2 border-[var(--outline)] min-w-[220px]">
              DANCER NAME / MATRIC
            </th>
            {sessions.map((s) => (
              <th
                key={s.id}
                className="p-3 border-r-2 border-[var(--outline)] text-center min-w-[90px] bg-[var(--night-2)]"
              >
                <div>#{s.seq}</div>
                <div className="font-mono text-[12px] text-[var(--text-2)]">
                  {formatDayLabel(s.date).slice(4)}
                </div>
              </th>
            ))}
            <th className="p-3 text-center min-w-[80px] bg-[var(--night-2)]">TOTAL</th>
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-[var(--outline)]">
          {members.length === 0 ? (
            <tr>
              <td
                colSpan={sessions.length + 2}
                className="p-6 text-center text-[14px] font-body text-[var(--text-2)] bg-[var(--night-2)]"
              >
                No dancers registered for this style in this month.
              </td>
            </tr>
          ) : (
            members.map((m) => {
              const attendedList = presentMap[m.memberId] || [];
              const attendedCount = sessions.filter((s) => attendedList.includes(s.id)).length;

              return (
                <tr
                  key={m.memberId}
                  className="min-h-[48px] h-12 odd:bg-[var(--night-2)] even:bg-[var(--violet-1)] hover:bg-[var(--violet-2)] transition-none"
                >
                  <td className="sticky left-0 z-10 bg-inherit p-3 border-r-2 border-[var(--outline)]">
                    <div className="font-display text-[12px] text-[var(--text-1)] font-bold truncate">
                      {m.fullName}
                    </div>
                    <div className="font-mono text-[12px] text-[var(--text-2)]">
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
                        className={`p-2 border-r-2 border-[var(--outline)] text-center select-none min-h-[48px] min-w-[48px] transition-none ${
                          readOnly ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          isPresent
                            ? `bg-[var(--neon-green)]/15 text-[var(--on-neon)] ${readOnly ? '' : 'hover:bg-[var(--neon-green)]/25'}`
                            : `text-[var(--text-2)] ${readOnly ? '' : 'hover:bg-[var(--violet-3)]'}`
                        }`}
                      >
                        <div
                          className={`w-8 h-8 mx-auto flex items-center justify-center border-2 ${
                            isPresent
                              ? 'bg-[var(--neon-green)] border-[var(--outline)] text-[var(--on-neon)] shadow-[1px_1px_0_var(--outline)]'
                              : 'border-[var(--violet-4)] bg-transparent'
                          }`}
                        >
                          {isPresent && (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M18 6h2v2h-2V6zm-2 4V8h2v2h-2zm-2 2v-2h2v2h-2zm-2 2h2v-2h-2v2zm-2 2h2v-2h-2v2zm-2 0v2h2v-2H8zm-2-2h2v2H6v-2zm0 0H4v-2h2v2z"
                                fill="currentColor"
                              />
                            </svg>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="p-3 text-center font-mono text-[12px] font-bold text-[var(--neon-cyan)]">
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
