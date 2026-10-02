import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  scene?: 'rooftop' | 'shutter' | 'boombox';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  scene = 'rooftop',
  className = ''
}) => {
  return (
    <div
      className={`px-panel p-8 text-center flex flex-col items-center justify-center gap-3 ${className}`}
    >
      {scene ? (
        <img
          src={`/art/a9-${scene}.webp`}
          alt=""
          loading="lazy"
          className="px-art w-[288px] max-[360px]:w-[192px] h-auto select-none pointer-events-none mb-2"
        />
      ) : icon ? (
        <div className="text-4xl text-[var(--text-2)]">{icon}</div>
      ) : null}
      <h3 className="font-display text-[12px] tracking-wider uppercase text-[var(--text-1)]">
        {title}
      </h3>
      {description && (
        <p className="font-body text-[16px] text-[var(--text-2)] max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
