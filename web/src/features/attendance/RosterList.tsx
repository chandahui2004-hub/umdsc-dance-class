import React, { useState, useMemo } from 'react';
import type { ClassSession } from '@umdsc/shared';
import { PixelButton } from '../../components/ui/PixelButton';
import { formatDayLabel } from '../../lib/time';

export interface RosterMember {
  memberId: string;
  fullName: string;
  matric: string;
}

interface RosterListProps {
  sessions: ClassSession[];
  members: RosterMember[];
  presentMap: Record<string, string[]>; // memberId -> sessionId[]
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onToggle: (memberId: string, sessionId: string, present: boolean) => void;
  readOnly?: boolean;
  listClassName?: string;
}

export const RosterList: React.FC<RosterListProps> = ({
  sessions,
  members,
  presentMap,
  activeSessionId,
  onSelectSession,
  onToggle,
  readOnly = false,
  listClassName
}) => {
  const [search, setSearch] = useState('');

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0] || null,
    [sessions, activeSessionId]
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.matric.toLowerCase().includes(q)
    );
  }, [members, search]);

  const presentCount = useMemo(() => {
    if (!activeSession) return 0;
    return members.filter((m) =>
      (presentMap[m.memberId] || []).includes(activeSession.id)
    ).length;
  }, [members, presentMap, activeSession]);

  if (sessions.length === 0) {
    return (
      <div className="p-6 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] text-center shadow-[4px_4px_0_var(--c-ink)]">
        <p className="font-display text-sm text-[var(--c-red)]">
          NO SESSIONS SCHEDULED FOR THIS MONTH
        </p>
        <p className="font-body text-sm text-[var(--c-darkgrey)] mt-2">
          Use the Calendar to schedule class sessions first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session Chips */}
      <div className="flex gap-2 overflow-x-auto pixel-scrollbar pb-2 border-b-2 border-[var(--c-ink)]">
        {sessions.map((s) => {
          const isSelected = (activeSession?.id === s.id);
          const label = `#${s.seq} ${formatDayLabel(s.date).slice(4)}`; // e.g. '#1 08 Oct'
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSession(s.id)}
              className={`min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-display text-xs cursor-pointer select-none whitespace-nowrap transition-none ${
                isSelected
                  ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)]'
                  : 'bg-[var(--c-panel)] text-[var(--c-ink)] hover:bg-[var(--c-bg)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Roster Controls: Search & Live SCORE counter */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dancer or matric..."
          aria-label="Search dancer"
          className="min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)] flex-1"
        />
        <div className="p-2 border-2 border-[var(--c-ink)] bg-[var(--c-yellow)] text-center font-display text-xs text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)]">
          SCORE {presentCount}/{members.length}
        </div>
      </div>

      {/* Roster Dancers List with scrollbar */}
      <div
        className={
          listClassName ||
          'space-y-2 max-h-[600px] overflow-y-auto pixel-scrollbar p-1 border-2 border-[var(--c-ink)] bg-[var(--c-bg)]/20'
        }
      >
        {filteredMembers.length === 0 ? (
          <div className="p-4 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] text-center text-xs font-body text-[var(--c-darkgrey)]">
            No dancers found matching &ldquo;{search}&rdquo;
          </div>
        ) : (
          filteredMembers.map((m) => {
            const isPresent = Boolean(
              activeSession && (presentMap[m.memberId] || []).includes(activeSession.id)
            );

            return (
              <div
                key={m.memberId}
                data-member-id={m.memberId}
                className={`p-3 border-2 border-[var(--c-ink)] flex items-center justify-between gap-3 shadow-[2px_2px_0_var(--c-ink)] transition-none ${
                  isPresent ? 'bg-[var(--c-green)]/30' : 'bg-[var(--c-panel)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-xs text-[var(--c-ink)] truncate font-bold">
                    {m.fullName}
                  </h4>
                  <p className="font-mono text-[11px] text-[var(--c-darkgrey)]">
                    {m.matric}
                  </p>
                </div>

                <div className="flex-shrink-0">
                  <PixelButton
                    size="md"
                    disabled={readOnly}
                    variant={isPresent ? 'primary' : 'secondary'}
                    className={
                      isPresent
                        ? '!bg-[var(--c-green)] !text-[var(--c-ink)] font-bold'
                        : '!bg-[var(--c-panel)] !text-[var(--c-darkgrey)]'
                    }
                    onClick={() => {
                      if (activeSession) {
                        onToggle(m.memberId, activeSession.id, !isPresent);
                      }
                    }}
                  >
                    {isPresent ? '✓ PRESENT' : 'ABSENT'}
                  </PixelButton>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
