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
      className={`px-panel px-corners ${className}`}
      {...props}
    >
      {title && (
        <div className="bg-[var(--night-2)] text-[var(--text-1)] px-4 py-2 border-b-2 border-[var(--neon-cyan)] flex items-center justify-between font-display text-[12px] tracking-wider">
          <span className="px-glow-text">{title}</span>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
};
