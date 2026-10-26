import React, { useState } from 'react';
import { TabBar, TabDef, NavSubItem } from '../components/ui/TabBar';
import { UserInfoBoard } from '../components/ui/UserInfoBoard';
import { LiveClock } from '../components/ui/LiveClock';
import { LogoBadge } from '../components/ui/LogoBadge';
import { SkylineStrip } from '../components/art/SkylineStrip';
import { session } from '../lib/session';
import { NotificationWidget } from '../components/ui/NotificationWidget';

export interface PhoneShellProps {
  tabs: TabDef[];
  moreItems?: NavSubItem[];
  header?: React.ReactNode;
  /** Shown above the page content, e.g. the admin event picker. */
  topBar?: React.ReactNode;
  children: React.ReactNode;
}

export const PhoneShell: React.FC<PhoneShellProps> = ({
  tabs,
  moreItems,
  header,
  topBar,
  children
}) => {
  const [isUserInfoOpen, setIsUserInfoOpen] = useState(false);

  const currentSession = session.get();
  const claims = currentSession?.claims;
  const role = claims?.role || 'dancer';
  const isAdmin = role === 'admin';
  const username = claims?.name || claims?.sub || 'Guest';

  return (
    <div
      data-testid="phone-shell"
      className="min-h-[100dvh] px-starfield text-[var(--text-1)] flex flex-col justify-between"
    >
      {/* Shell Container: centered with max-width 560px on tablet (768-1023px) */}
      <div
        className="w-full md:max-w-[560px] md:mx-auto md:border-x-4 md:border-[var(--outline)] md:shadow-[6px_0_0_var(--outline)] flex-1 flex flex-col bg-[var(--night-1)] pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+16px)]"
      >
        {/* Top User Status & Live Clock Bar */}
        <div className="sticky top-0 z-[var(--z-chrome)] bg-[var(--night-2)] text-[var(--text-1)] border-b-2 border-[var(--outline)] shadow-[0_4px_0_var(--outline)] pt-[env(safe-area-inset-top)] overflow-x-hidden">
          <div className="h-[var(--topbar-h)] px-2 sm:px-3 flex items-center justify-between gap-1 sm:gap-2 select-none">
            {/* Left: Brand + Role Badge */}
            <div className="flex items-center gap-1.5 shrink-0 overflow-hidden">
              <LogoBadge height={32} />
              <span className="font-display text-xs tracking-wider text-[var(--neon-gold)] uppercase">
                UMDSC
              </span>
              <span
                data-testid="mobile-role-badge"
                className={`font-display text-[11px] uppercase px-1.5 py-0.5 border border-[var(--outline)] shrink-0 ${
                  isAdmin
                    ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
                    : 'bg-[var(--night-0)] text-[var(--neon-cyan)] border-[var(--neon-cyan)]'
                }`}
              >
                {claims?.roleName?.toUpperCase() || (isAdmin ? 'ADMIN' : 'DANCER')}
              </span>
            </div>

            {/* Middle: Compact Live Clock */}
            <LiveClock compact showDate={false} className="shrink-0" />

            {/* Right: Username + Toggle Button */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => setIsUserInfoOpen(!isUserInfoOpen)}
                aria-label={isUserInfoOpen ? 'Close user info board' : 'Open user info board'}
                data-testid="user-info-toggle-btn"
                data-truncate-ok
                className="min-h-[40px] px-1.5 sm:px-2 py-1 px-panel text-[var(--text-1)] border-2 border-[var(--outline)] font-display text-[11px] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer flex items-center gap-1"
              >
                <span className="truncate max-w-[48px] sm:max-w-[65px] font-bold">{username}</span>
                <span>{isUserInfoOpen ? '▲' : '▼'}</span>
              </button>
            </div>
          </div>

          {/* Collapsible Dropdown: Full User Information Board */}
          {isUserInfoOpen && (
            <div
              data-testid="mobile-user-info-dropdown"
              className="p-3 bg-[var(--night-1)] border-t-2 border-[var(--outline)] animate-in fade-in slide-in-from-top-2 duration-100"
            >
              <UserInfoBoard onSignOut={() => setIsUserInfoOpen(false)} />
            </div>
          )}

          {/* Skyline strip directly under the top bar row */}
          <SkylineStrip />
        </div>

        {/* Optional Custom Header */}
        {header && (
          <div className="bg-[var(--night-2)] text-[var(--text-1)] border-b-2 border-[var(--outline)] px-4 py-2">
            {header}
          </div>
        )}

        {/* Top bar (e.g. admin event picker) */}
        {topBar && (
          <div className="px-4 pt-4">
            <div className="p-3 px-panel">
              {topBar}
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Bottom Navigation */}
      <div className="w-full md:max-w-[560px] md:mx-auto">
        <TabBar tabs={tabs} moreItems={moreItems} />
      </div>

      {/* Floating Retro Notification Center (Movable) */}
      <NotificationWidget />
    </div>
  );
};
