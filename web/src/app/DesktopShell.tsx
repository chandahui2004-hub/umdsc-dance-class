import React from 'react';
import { Sidebar } from '../components/ui/Sidebar';
import { TabDef, NavSubItem } from '../components/ui/TabBar';

export interface DesktopShellProps {
  nav: TabDef[];
  moreItems?: NavSubItem[];
  userFooter?: React.ReactNode;
  /** Shown above the page content, e.g. the admin event picker. */
  topBar?: React.ReactNode;
  children: React.ReactNode;
}

export const DesktopShell: React.FC<DesktopShellProps> = ({
  nav,
  moreItems,
  userFooter,
  topBar,
  children
}) => {
  return (
    <div
      data-testid="desktop-shell"
      className="min-h-screen px-starfield text-[var(--text-1)] flex"
    >
      {/* Fixed Sidebar */}
      <Sidebar nav={nav} moreItems={moreItems} footer={userFooter} />

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {topBar && (
          <div className="mb-6 p-3 px-panel max-w-xl">
            {topBar}
          </div>
        )}
        {children}
      </main>
    </div>
  );
};
