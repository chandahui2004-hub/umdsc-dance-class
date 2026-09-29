import React from 'react';
import { TabBar, TabDef } from '../components/ui/TabBar';

export interface PhoneShellProps {
  tabs: TabDef[];
  header?: React.ReactNode;
  children: React.ReactNode;
}

export const PhoneShell: React.FC<PhoneShellProps> = ({
  tabs,
  header,
  children
}) => {
  return (
    <div
      data-testid="phone-shell"
      className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)] flex flex-col justify-between"
    >
      {/* Shell Container: centered with max-width 560px on tablet (768-1023px) */}
      <div className="w-full md:max-w-[560px] md:mx-auto md:border-x-4 md:border-[var(--c-ink)] md:shadow-[6px_0_0_var(--c-ink)] flex-1 flex flex-col bg-[var(--c-bg)] pb-20">
        {header && (
          <header className="sticky top-0 z-30 bg-[var(--c-navy)] text-[var(--c-panel)] border-b-4 border-[var(--c-ink)] px-4 py-3 shadow-[0_4px_0_var(--c-ink)]">
            {header}
          </header>
        )}
        <main className="flex-1 p-4 overflow-x-hidden">{children}</main>
      </div>

      {/* Fixed bottom tab bar */}
      <div className="w-full md:max-w-[560px] md:mx-auto">
        <TabBar tabs={tabs} />
      </div>
    </div>
  );
};
