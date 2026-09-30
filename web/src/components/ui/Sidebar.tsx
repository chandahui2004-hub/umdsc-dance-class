import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { TabDef } from './TabBar';
import { UserInfoBoard } from './UserInfoBoard';

export interface SidebarProps {
  nav: TabDef[];
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  defaultCollapsed?: boolean;
}

const STORAGE_KEY = 'umdsc:sidebar-collapsed';

export const Sidebar: React.FC<SidebarProps> = ({
  nav,
  title = 'UMDSC',
  subtitle = 'Dance Class',
  footer,
  defaultCollapsed = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
    return defaultCollapsed;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

  return (
    <aside
      aria-label="Desktop Sidebar"
      data-collapsed={isCollapsed}
      className={`${
        isCollapsed ? 'w-20' : 'w-64'
      } bg-[var(--c-panel)] border-r-4 border-[var(--c-ink)] flex flex-col h-screen sticky top-0 shadow-[4px_0_0_var(--c-ink)] transition-[width] duration-150 shrink-0 select-none z-30`}
    >
      {/* Brand Header */}
      <div className="p-3 bg-[var(--c-navy)] text-[var(--c-panel)] border-b-4 border-[var(--c-ink)] flex items-center justify-between gap-2">
        {!isCollapsed ? (
          <>
            <div className="overflow-hidden">
              <h1 className="font-display text-sm tracking-wider uppercase text-[var(--c-yellow)] truncate">
                {title}
              </h1>
              <p className="font-body text-xs text-[var(--c-peach)] tracking-wide mt-0.5 truncate">
                {subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label="Collapse navigation"
              title="Collapse navigation"
              data-testid="sidebar-toggle-btn"
              className="p-1.5 bg-[var(--c-ink)] text-[var(--c-yellow)] hover:bg-[var(--c-darkgrey)] border border-[var(--c-yellow)] shadow-[1px_1px_0_var(--c-ink)] active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center font-display text-xs cursor-pointer"
            >
              ◀
            </button>
          </>
        ) : (
          <div className="w-full flex flex-col items-center gap-1">
            <span className="font-display text-[10px] text-[var(--c-yellow)] uppercase">
              UM
            </span>
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label="Expand navigation"
              title="Expand navigation"
              data-testid="sidebar-toggle-btn"
              className="w-full p-1 bg-[var(--c-ink)] text-[var(--c-yellow)] hover:bg-[var(--c-darkgrey)] border border-[var(--c-yellow)] shadow-[1px_1px_0_var(--c-ink)] active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center font-display text-xs cursor-pointer"
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-2 space-y-2 overflow-y-auto overflow-x-hidden">
        {nav.map(item => (
          <NavLink
            key={item.id}
            to={item.path}
            title={item.label}
            aria-label={item.label}
            className={({ isActive }) =>
              `flex items-center ${
                isCollapsed ? 'justify-center px-1' : 'justify-start gap-3 px-3'
              } py-2.5 min-h-[44px] border-2 border-[var(--c-ink)] font-display text-xs select-none transition-none relative ${
                isActive
                  ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] translate-x-[2px]'
                  : 'bg-[var(--c-panel)] text-[var(--c-ink)] hover:bg-[var(--c-peach)]'
              }`
            }
          >
            <span className="w-5 h-5 flex items-center justify-center shrink-0">
              {item.icon}
            </span>
            {!isCollapsed && (
              <span className="flex-1 truncate">{item.label}</span>
            )}
            {item.badge !== undefined && (
              <span
                className={`${
                  isCollapsed
                    ? 'absolute -top-1 -right-1'
                    : 'ml-auto'
                } bg-[var(--c-red)] text-[var(--c-panel)] text-[8px] px-1 border border-[var(--c-ink)]`}
              >
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer / User Information Board */}
      <div className="border-t-4 border-[var(--c-ink)] bg-[var(--c-bg)] overflow-hidden">
        {footer ? (
          <div className="p-2">{footer}</div>
        ) : (
          <div className="p-2">
            <UserInfoBoard compact={isCollapsed} />
          </div>
        )}
      </div>
    </aside>
  );
};
