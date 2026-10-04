import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Sheet } from './Sheet';

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
      {moreItems && moreItems.length > 0 && (
        <Sheet
          isOpen={isMoreOpen}
          onClose={() => setIsMoreOpen(false)}
          title="MORE OPTIONS"
          backdropTestId="tabbar-more-backdrop"
          contentTestId="tabbar-more-drawer"
        >
          <div className="grid grid-cols-2 gap-2">
            {moreItems.map(sub => (
              <NavLink
                key={sub.id}
                to={sub.path}
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 p-2.5 min-h-[48px] px-panel font-display text-[10px] uppercase select-none cursor-pointer ${
                    isActive
                      ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold'
                      : 'text-[var(--text-1)] hover:bg-[var(--violet-2)]'
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
        </Sheet>
      )}

      {/* Arcade Dock */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed left-2 right-2 bottom-[calc(8px+env(safe-area-inset-bottom))] h-[var(--dock-h)] px-panel z-[var(--z-chrome)] md:max-w-[544px] md:mx-auto flex items-stretch"
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
                className={`min-h-[56px] flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-1 py-1 select-none transition-none cursor-pointer border-r-2 last:border-r-0 border-[var(--outline)] relative ${
                  isMoreActive || isMoreOpen
                    ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold before:absolute before:-top-[6px] before:inset-x-2 before:h-1 before:bg-[var(--neon-gold)]'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--violet-1)]'
                }`}
              >
                <div className="w-6 h-6 flex items-center justify-center relative">
                  {tab.icon}
                </div>
                <span className="font-display text-[10px] uppercase tracking-tight truncate max-w-full text-center px-0.5 flex items-center gap-0.5">
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
                `min-h-[56px] flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-1 py-1 select-none transition-none cursor-pointer border-r-2 last:border-r-0 border-[var(--outline)] relative ${
                  isActive
                    ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold before:absolute before:-top-[6px] before:inset-x-2 before:h-1 before:bg-[var(--neon-gold)]'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--violet-1)]'
                }`
              }
            >
              <div className="w-6 h-6 flex items-center justify-center relative">
                {tab.icon}
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] bg-[var(--neon-red)] text-[var(--on-neon)] font-display text-[10px] px-1 border border-[var(--outline)] text-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="font-display text-[10px] uppercase tracking-tight truncate max-w-full text-center px-0.5">
                {tab.label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
};
