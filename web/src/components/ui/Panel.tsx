import React from 'react';

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  headerRight,
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] ${className}`}
      {...props}
    >
      {title && (
        <div className="bg-[var(--c-navy)] text-[var(--c-panel)] px-4 py-2 border-b-4 border-[var(--c-ink)] flex items-center justify-between font-display text-xs tracking-wider">
          <span>{title}</span>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
};
