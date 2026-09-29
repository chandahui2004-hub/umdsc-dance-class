import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = ''
}) => {
  return (
    <div
      className={`border-4 border-dashed border-[var(--c-ink)] bg-[var(--c-panel)] p-8 text-center flex flex-col items-center justify-center gap-3 ${className}`}
    >
      {icon && <div className="text-4xl text-[var(--c-darkgrey)]">{icon}</div>}
      <h3 className="font-display text-sm tracking-wider uppercase text-[var(--c-ink)]">
        {title}
      </h3>
      {description && (
        <p className="font-body text-base text-[var(--c-darkgrey)] max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
