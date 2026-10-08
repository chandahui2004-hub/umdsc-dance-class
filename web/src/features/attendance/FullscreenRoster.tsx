import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ClassSession } from '@umdsc/shared';
import { PixelButton } from '../../components/ui/PixelButton';
import { formatDayLabel } from '../../lib/time';
import { useOverlayOpen } from '../../app/useOverlayOpen';

export interface FullscreenRosterProps {
  eventName: string;
  styleName: string;
  sessions: ClassSession[];
  members: { memberId: string; fullName: string; matric: string }[];
  presentMap: Record<string, string[]>;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onToggle: (memberId: string, sessionId: string, present: boolean) => void;
  /** Ticks changed since the last save. */
  changes: number;
  submitting: boolean;
  onSubmit: () => void;
  onExit: () => void;
}

/** Full-screen tick mode: the class at the top, then big rows the admin taps to mark present. */
export const FullscreenRoster: React.FC<FullscreenRosterProps> = ({
  eventName,
  styleName,
  sessions,
  members,
  presentMap,
  activeSessionId,
  onSelectSession,
  onToggle,
  changes,
  submitting,
  onSubmit,
  onExit
}) => {
  useOverlayOpen(true); // hides the floating HIDE NAV button
  useLockPageScroll();
  const session = sessions.find(s => s.id === activeSessionId) || sessions[0] || null;

  // Drawn on <body>, outside the page's scrolling area, so phones scroll the list and not the page behind
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[var(--night-1)] flex flex-col" role="dialog" aria-label="Attendance full screen">
      <header className="shrink-0 px-panel border-b-2 border-[var(--outline)] py-3 shadow-[0_4px_0_var(--outline)]">
        <div className="w-full max-w-[760px] mx-auto px-3 space-y-2">
        <h2 className="font-display text-[14px] md:text-[16px] text-[var(--text-1)] leading-snug">{eventName}</h2>
        <div className="flex flex-wrap items-center gap-2 font-display text-[12px] text-[var(--neon-gold)]">
          <span>{styleName.toUpperCase()}</span>
          {session && <span>· CLASS {session.seq}</span>}
          {sessions.length > 1 ? (
            <select
              aria-label="Class date"
              value={session?.id || ''}
              onChange={e => onSelectSession(e.target.value)}
              disabled={submitting}
              className="min-h-[44px] px-2 px-well font-body text-[16px] text-[var(--text-1)]"
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {formatDayLabel(s.date)}
                </option>
              ))}
            </select>
          ) : (
            session && <span>{formatDayLabel(session.date).toUpperCase()}</span>
          )}
        </div>
        <div className="flex gap-2">
          <PixelButton
            size="md"
            variant="primary"
            className="flex-1"
            disabled={submitting || changes === 0}
            onClick={onSubmit}
          >
            {submitting ? 'SAVING…' : changes > 0 ? `SUBMIT (${changes})` : 'SUBMIT'}
          </PixelButton>
          <PixelButton size="md" variant="secondary" disabled={submitting} onClick={onExit}>
            ✕ EXIT
          </PixelButton>
        </div>
        </div>
      </header>

      <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain pixel-scrollbar p-3 space-y-2 w-full max-w-[760px] mx-auto">
        {session &&
          members.map(m => {
            const present = (presentMap[m.memberId] || []).includes(session.id);
            return (
              <li key={m.memberId}>
                <button
                  type="button"
                  data-member-id={m.memberId}
                  aria-pressed={present}
                  aria-label={`${m.fullName} ${present ? 'present' : 'absent'}`}
                  disabled={submitting}
                  onClick={() => onToggle(m.memberId, session.id, !present)}
                  className={`w-full min-h-[72px] flex items-center gap-3 px-4 py-3 border-2 text-left cursor-pointer select-none touch-manipulation shadow-[2px_2px_0_var(--outline)] ${
                    present
                      ? 'bg-[var(--neon-green)] border-[var(--outline)] text-[var(--on-neon)]'
                      : 'bg-[var(--night-2)] border-[var(--outline)] text-[var(--text-1)] active:bg-[var(--violet-2)]'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block font-body text-[20px] font-bold leading-tight break-words">{m.fullName}</span>
                    <span className={`block font-mono text-[14px] ${present ? 'text-[var(--on-neon)]' : 'text-[var(--text-2)]'}`}>
                      {m.matric}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`shrink-0 w-11 h-11 flex items-center justify-center border-4 border-[var(--outline)] font-display text-[22px] ${
                      present ? 'bg-[var(--night-1)] text-[var(--neon-green)]' : 'bg-[var(--night-1)] text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>,
    document.body
  );
};

/** Freezes the page behind the full-screen list while it is open. */
function useLockPageScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const before = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = before.html;
      body.style.overflow = before.body;
    };
  }, []);
}
