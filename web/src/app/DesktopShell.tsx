import React from 'react';
import { Sidebar } from '../components/ui/Sidebar';
import { TabDef } from '../components/ui/TabBar';

export interface DesktopShellProps {
  nav: TabDef[];
  userFooter?: React.ReactNode;
  /** Shown above the page content, e.g. the admin event picker. */
  topBar?: React.ReactNode;
  children: React.ReactNode;
}

export const DesktopShell: React.FC<DesktopShellProps> = ({
  nav,
  userFooter,
  topBar,
  children
}) => {
  return (
    <div
      data-testid="desktop-shell"
      className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)] flex"
    >
      {/* Fixed Sidebar */}
      <Sidebar nav={nav} footer={userFooter} />

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {topBar && (
          <div className="mb-6 p-3 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] max-w-xl">
            {topBar}
          </div>
        )}
        {children}
      </main>
    </div>
  );
};
