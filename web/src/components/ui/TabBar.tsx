import React from 'react';
import { NavLink } from 'react-router-dom';

export interface TabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number | string;
}

export interface TabBarProps {
  tabs: TabDef[];
}

export const TabBar: React.FC<TabBarProps> = ({ tabs }) => {
  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--c-panel)] border-t-4 border-[var(--c-ink)] flex items-stretch h-16 shadow-[0_-4px_0_var(--c-ink)]"
    >
      {tabs.map(tab => (
        <NavLink
          key={tab.id}
          to={tab.path}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-1 min-h-[48px] px-1 py-1 select-none transition-none cursor-pointer border-r-2 last:border-r-0 border-[var(--c-ink)] ${
              isActive
                ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] font-bold'
                : 'bg-[var(--c-panel)] text-[var(--c-ink)] hover:bg-[var(--c-peach)]'
            }`
          }
        >
          <div className="w-6 h-6 flex items-center justify-center relative">
            {tab.icon}
            {tab.badge !== undefined && (
              <span className="absolute -top-1 -right-2 bg-[var(--c-red)] text-[var(--c-panel)] font-display text-[8px] px-1 border border-[var(--c-ink)]">
                {tab.badge}
              </span>
            )}
          </div>
          <span className="font-display text-[8px] sm:text-[9px] md:text-[10px] tracking-tight truncate max-w-full text-center px-0.5">
            {tab.label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
};
