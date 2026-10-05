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

export const DancerFigureIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 20 20"
    fill="currentColor"
    shapeRendering="crispEdges"
    className={className}
    aria-hidden="true"
  >
    {/* Cap & Brim */}
    <rect x="7" y="1" width="5" height="2" />
    <rect x="12" y="2" width="2" height="1" />
    {/* Head / Face */}
    <rect x="8" y="3" width="4" height="3" />
    {/* Torso / Jacket */}
    <rect x="7" y="6" width="6" height="5" />
    {/* Left Arm (raised wave/popping) */}
    <rect x="5" y="6" width="2" height="2" />
    <rect x="4" y="4" width="2" height="3" />
    <rect x="3" y="3" width="2" height="2" />
    {/* Right Arm (extended freeze) */}
    <rect x="13" y="7" width="2" height="2" />
    <rect x="15" y="8" width="2" height="3" />
    <rect x="16" y="10" width="2" height="2" />
    {/* Left Leg */}
    <rect x="6" y="11" width="3" height="4" />
    {/* Right Leg (wide bent groove) */}
    <rect x="11" y="11" width="3" height="3" />
    <rect x="13" y="13" width="3" height="3" />
    {/* High-top Sneakers */}
    <rect x="4" y="15" width="5" height="2" />
    <rect x="13" y="16" width="5" height="2" />
  </svg>
);

export const AdminCrownIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 20 20"
    fill="currentColor"
    shapeRendering="crispEdges"
    className={className}
    aria-hidden="true"
  >
    {/* 3 Crown peaks */}
    <rect x="3" y="4" width="3" height="3" />
    <rect x="8.5" y="2" width="3" height="3" />
    <rect x="14" y="4" width="3" height="3" />
    {/* Upper Connectors */}
    <rect x="4" y="7" width="12" height="2" />
    {/* Crown body */}
    <rect x="3" y="9" width="14" height="4" />
    {/* Crown Rim Base */}
    <rect x="2" y="13" width="16" height="3" />
    {/* Jewels */}
    <rect x="4" y="14" width="2" height="1" fill="#000" />
    <rect x="9" y="14" width="2" height="1" fill="#000" />
    <rect x="14" y="14" width="2" height="1" fill="#000" />
  </svg>
);

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
          data-testid="user-role-avatar-compact"
          aria-label={isAdmin ? 'Admin Profile' : 'Dancer Profile'}
          title={`${username} (${isAdmin ? 'ADMIN' : 'DANCER'} - ${matriksNumber})`}
          className={`w-9 h-9 border-2 border-[var(--outline)] flex items-center justify-center select-none shadow-[2px_2px_0_var(--shadow-hard)] ${
            isAdmin
              ? 'bg-[var(--neon-gold)] text-[var(--on-neon)]'
              : 'bg-[var(--violet-2)] text-[var(--neon-cyan)]'
          }`}
        >
          {isAdmin ? (
            <AdminCrownIcon className="w-5 h-5 drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]" />
          ) : (
            <DancerFigureIcon className="w-5 h-5 drop-shadow-[0_0_2px_rgba(0,240,255,0.4)]" />
          )}
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
          className="w-9 h-9 min-h-[44px] min-w-[44px] bg-[var(--neon-red)] text-[var(--on-neon)] border-2 border-[var(--outline)] hover:brightness-110 active:translate-x-[2px] active:translate-y-[2px] flex items-center justify-center cursor-pointer select-none shadow-[2px_2px_0_var(--shadow-hard)]"
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
        <span className="font-display text-[10px] text-[var(--text-2)] tracking-wider uppercase">
          PLAYER PROFILE
        </span>
        <span
          data-testid="user-role-badge"
          className={`font-display text-[10px] uppercase px-2 py-0.5 border-2 border-[var(--outline)] flex items-center gap-1.5 ${
            isAdmin
              ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
              : 'bg-[var(--violet-2)] text-[var(--neon-cyan)] font-bold'
          }`}
        >
          {isAdmin ? (
            <AdminCrownIcon className="w-3 h-3" />
          ) : (
            <DancerFigureIcon className="w-3 h-3" />
          )}
          <span>{isAdmin ? 'ADMIN' : 'DANCER'}</span>
        </span>
      </div>

      {/* User Information Details */}
      <div className="space-y-1.5 font-display text-xs">
        <div className="flex items-start gap-2">
          <span className="text-[var(--text-2)] text-[10px] w-[88px] shrink-0 whitespace-nowrap uppercase pt-0.5">
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
          <span className="text-[var(--text-2)] text-[10px] w-[88px] shrink-0 whitespace-nowrap uppercase pt-0.5">
            MATRIKS:
          </span>
          <span
            data-testid="user-matriks-display"
            className="text-[var(--neon-cyan)] font-mono text-sm font-bold tracking-wider min-w-0 break-all"
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
