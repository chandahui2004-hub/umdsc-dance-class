import React from 'react';
import { Sidebar } from '../components/ui/Sidebar';
import { TabDef } from '../components/ui/TabBar';

export interface DesktopShellProps {
  nav: TabDef[];
  userFooter?: React.ReactNode;
  children: React.ReactNode;
}

export const DesktopShell: React.FC<DesktopShellProps> = ({
  nav,
  userFooter,
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
        {children}
      </main>
    </div>
  );
};
