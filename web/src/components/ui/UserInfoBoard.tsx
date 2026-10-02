import React from 'react';
import { useNavigate } from 'react-router-dom';
import { session } from '../../lib/session';
import { LiveClock } from './LiveClock';
import { PixelButton } from './PixelButton';

export interface UserInfoBoardProps {
  compact?: boolean;
  className?: string;
  onSignOut?: () => void;
}

export const UserInfoBoard: React.FC<UserInfoBoardProps> = ({
  compact = false,
  className = '',
  onSignOut
}) => {
  const navigate = useNavigate();
  const currentSession = session.get();
  const claims = currentSession?.claims;

  const role = claims?.role || 'dancer';
  const isAdmin = role === 'admin';
  const username = claims?.name || claims?.sub || 'Guest';

  // Matriks number: For dancers, strip leading 'M-' if present. For admin, show STAFF / Admin username.
  const matriksNumber = claims?.sub
    ? isAdmin
      ? `STAFF (${claims.sub})`
      : claims.sub.replace(/^M-/, '')
    : '—';

  const handleSignOut = () => {
    session.clear();
    if (onSignOut) {
      onSignOut();
    }
    navigate('/login', { replace: true });
  };

  if (compact) {
    return (
      <div
        data-testid="user-info-board-compact"
        className={`flex flex-col items-center gap-2 p-2 px-panel ${className}`}
      >
        {/* Compact Avatar / Role Icon */}
        <div
          title={`${username} (${isAdmin ? 'ADMIN' : 'DANCER'} - ${matriksNumber})`}
          className={`w-9 h-9 border-2 border-[var(--outline)] flex items-center justify-center font-display text-[10px] select-none ${
            isAdmin
              ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
              : 'bg-[var(--violet-2)] text-[var(--neon-cyan)] font-bold'
          }`}
        >
          {isAdmin ? 'ADM' : 'DAN'}
        </div>

        {/* Compact Clock */}
        <LiveClock compact showDate={false} />

        {/* Compact Sign Out Button */}
        <button
          type="button"
          onClick={handleSignOut}
          title="Sign Out"
          aria-label="Sign Out"
          data-testid="sign-out-btn-compact"
          className="w-9 h-9 min-h-[44px] min-w-[44px] bg-[var(--neon-red)] text-[var(--on-neon)] border-2 border-[var(--outline)] hover:brightness-110 active:translate-x-[2px] active:translate-y-[2px] flex items-center justify-center cursor-pointer select-none"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 13v-2H7V8l-5 4 5 4v-3h9zM20 3H10v2h10v14H10v2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="user-info-board"
      className={`px-panel p-3 space-y-3 ${className}`}
    >
      {/* Board Header & Role Badge */}
      <div className="flex items-center justify-between border-b-2 border-[var(--outline)] pb-2">
        <span className="font-display text-[8px] text-[var(--text-2)] tracking-wider uppercase">
          PLAYER PROFILE
        </span>
        <span
          data-testid="user-role-badge"
          className={`font-display text-[8px] uppercase px-2 py-0.5 border-2 border-[var(--outline)] ${
            isAdmin
              ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
              : 'bg-[var(--violet-2)] text-[var(--neon-cyan)] font-bold'
          }`}
        >
          {isAdmin ? 'ADMIN' : 'DANCER'}
        </span>
      </div>

      {/* User Information Details */}
      <div className="space-y-1.5 font-display text-xs">
        <div className="flex items-start gap-2">
          <span className="text-[var(--text-2)] text-[9px] w-14 shrink-0 uppercase pt-0.5">
            USER:
          </span>
          <span
            data-testid="user-name-display"
            className="text-[var(--text-1)] font-bold truncate flex-1"
            title={username}
          >
            {username}
          </span>
        </div>

        <div className="flex items-start gap-2">
          <span className="text-[var(--text-2)] text-[9px] w-14 shrink-0 uppercase pt-0.5">
            MATRIKS:
          </span>
          <span
            data-testid="user-matriks-display"
            className="text-[var(--neon-cyan)] font-mono text-sm font-bold tracking-wider"
          >
            {matriksNumber}
          </span>
        </div>
      </div>

      {/* Real-time Clock */}
      <div className="pt-1">
        <LiveClock />
      </div>

      {/* Sign Out Button */}
      <div className="pt-1">
        <PixelButton
          variant="danger"
          size="sm"
          onClick={handleSignOut}
          data-testid="sign-out-btn"
          className="w-full flex items-center justify-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 13v-2H7V8l-5 4 5 4v-3h9zM20 3H10v2h10v14H10v2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
          </svg>
          <span>SIGN OUT</span>
        </PixelButton>
      </div>
    </div>
  );
};
