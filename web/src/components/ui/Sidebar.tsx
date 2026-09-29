import React from 'react';
import { NavLink } from 'react-router-dom';
import { TabDef } from './TabBar';

export interface SidebarProps {
  nav: TabDef[];
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  nav,
  title = 'UMDSC',
  subtitle = 'Dance Class',
  footer
}) => {
  return (
    <aside
      aria-label="Desktop Sidebar"
      className="w-64 bg-[var(--c-panel)] border-r-4 border-[var(--c-ink)] flex flex-col h-screen sticky top-0 shadow-[4px_0_0_var(--c-ink)]"
    >
      {/* Brand Header */}
      <div className="p-4 bg-[var(--c-navy)] text-[var(--c-panel)] border-b-4 border-[var(--c-ink)]">
        <h1 className="font-display text-sm tracking-wider uppercase text-[var(--c-yellow)]">
          {title}
        </h1>
        <p className="font-body text-xs text-[var(--c-peach)] tracking-wide mt-1">
          {subtitle}
        </p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
        {nav.map(item => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 min-h-[44px] border-2 border-[var(--c-ink)] font-display text-xs select-none transition-none ${
                isActive
                  ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] translate-x-[2px]'
                  : 'bg-[var(--c-panel)] text-[var(--c-ink)] hover:bg-[var(--c-peach)]'
              }`
            }
          >
            <span className="w-5 h-5 flex items-center justify-center">
              {item.icon}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge !== undefined && (
              <span className="bg-[var(--c-red)] text-[var(--c-panel)] text-[8px] px-1 border border-[var(--c-ink)]">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {footer && (
        <div className="p-3 border-t-4 border-[var(--c-ink)] bg-[var(--c-bg)]">
          {footer}
        </div>
      )}
    </aside>
  );
};
