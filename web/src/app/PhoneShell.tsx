import React, { useState } from 'react';
import { TabBar, TabDef, NavSubItem } from '../components/ui/TabBar';
import { UserInfoBoard } from '../components/ui/UserInfoBoard';
import { LiveClock } from '../components/ui/LiveClock';
import { session } from '../lib/session';

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
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  const currentSession = session.get();
  const claims = currentSession?.claims;
  const role = claims?.role || 'dancer';
  const isAdmin = role === 'admin';
  const username = claims?.name || claims?.sub || 'Guest';

  return (
    <div
      data-testid="phone-shell"
      className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)] flex flex-col justify-between"
    >
      {/* Shell Container: centered with max-width 560px on tablet (768-1023px) */}
      <div
        className={`w-full md:max-w-[560px] md:mx-auto md:border-x-4 md:border-[var(--c-ink)] md:shadow-[6px_0_0_var(--c-ink)] flex-1 flex flex-col bg-[var(--c-bg)] ${
          isNavCollapsed ? 'pb-8' : 'pb-24'
        }`}
      >
        {/* Top User Status & Live Clock Bar */}
        <div className="sticky top-0 z-30 bg-[var(--c-navy)] text-[var(--c-panel)] border-b-4 border-[var(--c-ink)] shadow-[0_4px_0_var(--c-ink)]">
          <div className="px-3 py-2 flex items-center justify-between gap-2 select-none">
            {/* Left: Brand + Role Badge */}
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div className="p-0.5 bg-white border border-[var(--c-ink)] shrink-0">
                <img
                  src="/logo.png"
                  alt="UMDSC Logo"
                  className="w-5 h-5 object-contain"
                />
              </div>
              <span className="font-display text-[10px] tracking-wider text-[var(--c-yellow)] uppercase">
                UMDSC
              </span>
              <span
                data-testid="mobile-role-badge"
                className={`font-display text-[8px] uppercase px-1.5 py-0.5 border border-[var(--c-ink)] ${
                  isAdmin
                    ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold'
                    : 'bg-[var(--c-navy)] text-[var(--c-yellow)] border-[var(--c-yellow)]'
                }`}
              >
                {isAdmin ? 'ADMIN' : 'DANCER'}
              </span>
            </div>

            {/* Middle: Compact Live Clock */}
            <LiveClock compact showDate={false} className="hidden sm:inline-flex" />

            {/* Right: Username + Toggle Button */}
            <div className="flex items-center gap-1.5">
              <LiveClock compact showDate={false} className="sm:hidden" />
              <button
                type="button"
                onClick={() => setIsUserInfoOpen(!isUserInfoOpen)}
                aria-label={isUserInfoOpen ? 'Close user info board' : 'Open user info board'}
                data-testid="user-info-toggle-btn"
                className="px-2 py-1 bg-[var(--c-panel)] text-[var(--c-ink)] border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] font-display text-[9px] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer flex items-center gap-1"
              >
                <span className="truncate max-w-[70px] font-bold">{username}</span>
                <span>{isUserInfoOpen ? '▲' : '▼'}</span>
              </button>
            </div>
          </div>

          {/* Collapsible Dropdown: Full User Information Board */}
          {isUserInfoOpen && (
            <div
              data-testid="mobile-user-info-dropdown"
              className="p-3 bg-[var(--c-bg)] border-t-2 border-[var(--c-ink)] animate-in fade-in slide-in-from-top-2 duration-100"
            >
              <UserInfoBoard onSignOut={() => setIsUserInfoOpen(false)} />
            </div>
          )}
        </div>

        {/* Optional Custom Header */}
        {header && (
          <div className="bg-[var(--c-navy)] text-[var(--c-panel)] border-b-4 border-[var(--c-ink)] px-4 py-2">
            {header}
          </div>
        )}

        {/* Top bar (e.g. admin event picker) */}
        {topBar && (
          <div className="px-4 pt-4">
            <div className="p-3 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)]">
              {topBar}
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-x-hidden">{children}</main>
      </div>

      {/* Bottom Navigation with Collapse & Expand */}
      <div className="w-full md:max-w-[560px] md:mx-auto">
        {!isNavCollapsed ? (
          <div className="relative">
            {/* Collapse Button atop the TabBar */}
            <div className="fixed bottom-16 right-3 z-50">
              <button
                type="button"
                onClick={() => setIsNavCollapsed(true)}
                aria-label="Collapse navigation"
                title="Collapse navigation"
                data-testid="mobile-nav-toggle-btn"
                className="px-2 py-1 bg-[var(--c-ink)] text-[var(--c-yellow)] border-2 border-[var(--c-yellow)] shadow-[2px_2px_0_var(--c-ink)] font-display text-[8px] flex items-center gap-1 cursor-pointer select-none active:translate-x-[1px] active:translate-y-[1px]"
              >
                <span>HIDE NAV</span>
                <span>▼</span>
              </button>
            </div>
            <TabBar tabs={tabs} moreItems={moreItems} />
          </div>
        ) : (
          /* Expand Button when TabBar is collapsed */
          <div className="fixed bottom-3 right-3 z-50">
            <button
              type="button"
              onClick={() => setIsNavCollapsed(false)}
              aria-label="Expand navigation"
              title="Expand navigation"
              data-testid="mobile-nav-toggle-btn"
              className="px-3 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)] border-2 border-[var(--c-ink)] shadow-[3px_3px_0_var(--c-ink)] font-display text-[9px] font-bold flex items-center gap-1.5 cursor-pointer select-none active:translate-x-[2px] active:translate-y-[2px]"
            >
              <span>SHOW NAV</span>
              <span>▲</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
