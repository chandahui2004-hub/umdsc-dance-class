import React from 'react';
import './MascotAvatar.css';

export type MascotAnimation = 'idle' | 'dance_1' | 'dance_2' | 'dance_3';

export interface MascotAvatarProps {
  animation?: MascotAnimation;
  alertCount?: number;
  hasErrors?: boolean;
  isDragging?: boolean;
  className?: string;
}

export const MascotAvatar: React.FC<MascotAvatarProps> = ({
  animation = 'idle',
  alertCount = 0,
  hasErrors = false,
  isDragging = false,
  className = ''
}) => {
  const animClass = `mascot-anim-${animation}`;

  return (
    <div
      data-testid="mascot-avatar"
      data-animation={animation}
      className={`relative inline-block transition-transform duration-100 ${
        isDragging ? 'scale-105 cursor-grabbing' : 'hover:scale-105 cursor-grab'
      } ${className}`}
    >
      {/* Ground Neon Shadow */}
      <div
        data-testid="mascot-ground-shadow"
        className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 sm:w-11 sm:h-2.5 rounded-full pointer-events-none transition-colors duration-200 ${
          hasErrors
            ? 'bg-[var(--night-0)]/90 border-2 border-[var(--neon-red)] shadow-[0_0_8px_var(--neon-red)] animate-pulse'
            : 'bg-[var(--night-0)]/90 border border-[var(--neon-cyan)]/60 shadow-[0_0_6px_rgba(62,230,255,0.4)]'
        }`}
      />

      {/* 8-Bit Pixel Character Sprite */}
      <div
        className={`w-[52px] h-[70px] sm:w-[64px] sm:h-[86px] mascot-sprite ${animClass}`}
        aria-hidden="true"
      />

      {/* Unread Alerts Badge */}
      {alertCount > 0 && (
        <span
          data-testid="mascot-badge"
          className={`absolute -top-1 -right-1 px-1.5 py-0.5 border-2 border-[var(--outline)] font-display text-[10px] sm:text-[11px] font-bold shadow-[2px_2px_0_var(--outline)] z-10 select-none ${
            hasErrors
              ? 'bg-[var(--neon-red)] text-white animate-pulse'
              : 'bg-[var(--neon-cyan)] text-[var(--on-neon)]'
          }`}
        >
          {alertCount > 99 ? '99+' : alertCount}
        </span>
      )}
    </div>
  );
};
