import React from 'react';

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

// `space-y-*` only spaces direct children. The frame's children are the title bar and the
// content area, so spacing classes must go on the content area, where the fields are.
const SPACING_CLASS = /^([a-z0-9]+:)*space-y-/;

export const Panel: React.FC<PanelProps> = ({
  title,
  headerRight,
  children,
  className = '',
  ...props
}) => {
  const classes = className.split(/\s+/).filter(Boolean);
  const spacing = classes.filter(c => SPACING_CLASS.test(c));
  const frame = classes.filter(c => !SPACING_CLASS.test(c));
  const bodySpacing = spacing.length > 0 ? spacing.join(' ') : 'space-y-4';

  return (
    <div
      className={`px-panel px-corners ${frame.join(' ')}`}
      {...props}
    >
      {title && (
        <div className="bg-[var(--night-2)] text-[var(--text-1)] px-4 py-2 border-b-2 border-[var(--neon-cyan)] flex items-center justify-between font-display text-[12px] tracking-wider">
          <span className="px-glow-text">{title}</span>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div data-testid="panel-body" className={`p-4 ${bodySpacing}`}>{children}</div>
    </div>
  );
};
