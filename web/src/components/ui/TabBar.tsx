import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export interface NavSubItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

export interface TabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number | string;
}

export interface TabBarProps {
  tabs: TabDef[];
  moreItems?: NavSubItem[];
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, moreItems }) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const location = useLocation();

  const isMoreActive = Boolean(
    moreItems?.some(sub => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/'))
  );

  return (
    <>
      {isMoreOpen && moreItems && moreItems.length > 0 && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMoreOpen(false)}
            data-testid="tabbar-more-backdrop"
          />
          <div
            data-testid="tabbar-more-drawer"
            className="fixed bottom-16 left-0 right-0 z-50 bg-[var(--c-panel)] border-t-4 border-x-4 border-[var(--c-ink)] shadow-[0_-6px_0_var(--c-ink)] p-4 max-w-lg mx-auto space-y-3"
          >
            <div className="flex items-center justify-between border-b-2 border-[var(--c-ink)] pb-2">
              <span className="font-display text-xs text-[var(--text-1)] font-bold tracking-wider">MORE OPTIONS</span>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="px-2 py-1 bg-[var(--c-bg)] border border-[var(--c-ink)] font-display text-[9px] font-bold cursor-pointer"
              >
                ✕ CLOSE
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map(sub => (
                <NavLink
                  key={sub.id}
                  to={sub.path}
                  onClick={() => setIsMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 p-2.5 min-h-[44px] border-2 border-[var(--c-ink)] font-display text-[9px] select-none cursor-pointer ${
                      isActive
                        ? 'bg-[var(--c-yellow)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--c-ink)]'
                        : 'bg-[var(--c-bg)] text-[var(--text-1)] hover:bg-[var(--c-peach)]'
                    }`
                  }
                >
                  <span className="w-5 h-5 flex items-center justify-center shrink-0">
                    {sub.icon}
                  </span>
                  <span className="truncate">{sub.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}

      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--c-panel)] border-t-4 border-[var(--c-ink)] flex items-stretch h-16 shadow-[0_-4px_0_var(--c-ink)]"
      >
        {tabs.map(tab => {
          const isMore = tab.id === 'more';

          if (isMore && moreItems && moreItems.length > 0) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setIsMoreOpen(prev => !prev)}
                data-testid="mobile-tab-more"
                className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[48px] px-1 py-1 select-none transition-none cursor-pointer border-r-2 last:border-r-0 border-[var(--c-ink)] ${
                  isMoreActive || isMoreOpen
                    ? 'bg-[var(--c-yellow)] text-[var(--on-neon)] font-bold'
                    : 'bg-[var(--c-panel)] text-[var(--text-1)] hover:bg-[var(--c-peach)]'
                }`}
              >
                <div className="w-6 h-6 flex items-center justify-center relative">
                  {tab.icon}
                </div>
                <span className="font-display text-[8px] sm:text-[9px] md:text-[10px] tracking-tight truncate max-w-full text-center px-0.5 flex items-center gap-0.5">
                  {tab.label} {isMoreOpen ? '▲' : '▼'}
                </span>
              </button>
            );
          }

          return (
            <NavLink
              key={tab.id}
              to={tab.path}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-1 min-h-[48px] px-1 py-1 select-none transition-none cursor-pointer border-r-2 last:border-r-0 border-[var(--c-ink)] ${
                  isActive
                    ? 'bg-[var(--c-yellow)] text-[var(--on-neon)] font-bold'
                    : 'bg-[var(--c-panel)] text-[var(--text-1)] hover:bg-[var(--c-peach)]'
                }`
              }
            >
              <div className="w-6 h-6 flex items-center justify-center relative">
                {tab.icon}
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 bg-[var(--c-red)] text-[var(--on-neon)] font-display text-[8px] px-1 border border-[var(--c-ink)]">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="font-display text-[8px] sm:text-[9px] md:text-[10px] tracking-tight truncate max-w-full text-center px-0.5">
                {tab.label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
};
