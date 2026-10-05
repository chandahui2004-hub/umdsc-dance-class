import React, { useState, useMemo } from 'react';
import type { ClassSession } from '@umdsc/shared';
import { PixelButton } from '../../components/ui/PixelButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDayLabel } from '../../lib/time';

const FULL_NAMES_KEY = 'umdsc:rosterFullNames';

function readFullNamesPref(): boolean {
  try {
    return localStorage.getItem(FULL_NAMES_KEY) === '1';
  } catch {
    return false;
  }
}

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
  // Phones are narrow: long names are shortened unless the user asks to see them in full.
  const [showFullNames, setShowFullNames] = useState<boolean>(readFullNamesPref);
  const toggleFullNames = () => {
    setShowFullNames(prev => {
      const next = !prev;
      try {
        localStorage.setItem(FULL_NAMES_KEY, next ? '1' : '0');
      } catch {
        // Private mode: the choice just isn't remembered.
      }
      return next;
    });
  };

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
      <EmptyState
        scene="rooftop"
        title="NO SESSIONS SCHEDULED"
        description="Use the Calendar to schedule class sessions first."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Session Chips */}
      <div className="flex gap-2 overflow-x-auto pixel-scrollbar pb-2 border-b-2 border-[var(--outline)]">
        {sessions.map((s) => {
          const isSelected = activeSession?.id === s.id;
          const label = `#${s.seq} ${formatDayLabel(s.date).slice(4)}`; // e.g. '#1 08 Oct'
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSession(s.id)}
              className={`min-h-[44px] px-3 border-2 border-[var(--outline)] font-display text-[12px] cursor-pointer select-none whitespace-nowrap transition-none ${
                isSelected
                  ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                  : 'px-well text-[var(--text-1)] hover:bg-[var(--violet-2)]'
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
          className="min-h-[48px] px-3 border-2 border-[var(--outline)] font-mono text-[16px] text-[var(--text-1)] px-well placeholder:text-[var(--text-3)] flex-1"
        />
        <div className="p-2 border-2 border-[var(--outline)] bg-[var(--neon-gold)] text-center font-display text-[12px] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]">
          SCORE {presentCount}/{members.length}
        </div>
      </div>

      <button
        type="button"
        onClick={toggleFullNames}
        aria-pressed={showFullNames}
        className="w-full min-h-[44px] px-3 border-2 border-[var(--outline)] font-display text-[10px] uppercase bg-[var(--violet-2)] text-[var(--text-1)] cursor-pointer active:translate-y-px"
      >
        {showFullNames ? '▲ SHORT NAMES' : '▼ SHOW FULL NAMES'}
      </button>

      {/* Roster Dancers List with scrollbar */}
      <div
        className={
          listClassName ||
          'space-y-2 max-h-[600px] overflow-y-auto pixel-scrollbar p-1 border-2 border-[var(--outline)] bg-[var(--night-1)]'
        }
      >
        {filteredMembers.length === 0 ? (
          <div className="p-4 px-panel border-2 border-[var(--outline)] text-center text-[14px] font-body text-[var(--text-2)]">
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
                data-testid={`roster-row-${m.memberId}`}
                className={`p-3 border-2 border-[var(--outline)] flex gap-3 shadow-[2px_2px_0_var(--outline)] transition-none min-h-[56px] ${
                  showFullNames ? 'flex-col items-stretch' : 'items-center justify-between'
                } ${
                  isPresent ? 'bg-[var(--violet-2)]' : 'bg-[var(--night-2)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <h4
                    className={`font-display text-[12px] text-[var(--text-1)] font-bold ${
                      showFullNames ? 'whitespace-normal break-words leading-relaxed' : 'truncate'
                    }`}
                  >
                    {m.fullName}
                  </h4>
                  <p className="font-mono text-[12px] text-[var(--text-2)]">
                    {m.matric}
                  </p>
                </div>

                <div className={showFullNames ? 'w-full [&>button]:w-full' : 'flex-shrink-0'}>
                  <PixelButton
                    size="md"
                    disabled={readOnly}
                    variant="secondary"
                    className={`min-h-[48px] px-3 flex items-center gap-2 ${
                      isPresent
                        ? '!bg-[var(--neon-green)] !text-[var(--on-neon)] font-bold border-[var(--outline)]'
                        : '!bg-[var(--night-1)] !text-[var(--text-2)] border-[var(--violet-4)]'
                    }`}
                    onClick={() => {
                      if (activeSession) {
                        onToggle(m.memberId, activeSession.id, !isPresent);
                      }
                    }}
                  >
                    <span
                      className={`w-5 h-5 flex items-center justify-center border-2 ${
                        isPresent
                          ? 'border-[var(--outline)] bg-[var(--neon-green)] text-[var(--on-neon)]'
                          : 'border-[var(--violet-4)] bg-transparent'
                      }`}
                    >
                      {isPresent && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M18 6h2v2h-2V6zm-2 4V8h2v2h-2zm-2 2v-2h2v2h-2zm-2 2h2v-2h-2v2zm-2 2h2v-2h-2v2zm-2 0v2h2v-2H8zm-2-2h2v2H6v-2zm0 0H4v-2h2v2z"
                            fill="currentColor"
                          />
                        </svg>
                      )}
                    </span>
                    <span>{isPresent ? '✓ PRESENT' : 'ABSENT'}</span>
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
