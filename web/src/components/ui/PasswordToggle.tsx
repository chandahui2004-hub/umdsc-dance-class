import React from 'react';

// Pixel eyes from pixelarticons (MIT), drawn inline like the site's other pixel icons
const EyeOpenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-icon="eye-open">
    <path d="M8 6h8v2H8V6zm-4 4V8h4v2H4zm-2 2v-2h2v2H2zm0 2v-2H0v2h2zm2 2H2v-2h2v2zm4 2H4v-2h4v2zm8 0v2H8v-2h8zm4-2v2h-4v-2h4zm2-2v2h-2v-2h2zm0-2h2v2h-2v-2zm-2-2h2v2h-2v-2zm0 0V8h-4v2h4zm-10 1h4v4h-4v-4z" />
  </svg>
);

const EyeClosedIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-icon="eye-closed">
    <path d="M0 7h2v2H0V7zm4 4H2V9h2v2zm4 2v-2H4v2H2v2h2v-2h4zm8 0H8v2H6v2h2v-2h8v2h2v-2h-2v-2zm4-2h-4v2h4v2h2v-2h-2v-2zm2-2v2h-2V9h2zm0 0V7h2v2h-2z" />
  </svg>
);

/** SHOW / HIDE for a password box: an open pixel eye while hidden, a closed one while showing. */
export const PasswordToggle: React.FC<{ shown: boolean; onToggle: () => void }> = ({ shown, onToggle }) => (
  <button
    type="button"
    aria-pressed={shown}
    aria-label={shown ? 'Hide password' : 'Show password'}
    onClick={onToggle}
    className="inline-flex items-center gap-2 min-h-[44px] px-2 font-display text-[12px] text-[var(--neon-cyan)] cursor-pointer hover:text-[var(--neon-gold)]"
  >
    {shown ? <EyeClosedIcon /> : <EyeOpenIcon />}
    <span>{shown ? 'HIDE' : 'SHOW'}</span>
  </button>
);
