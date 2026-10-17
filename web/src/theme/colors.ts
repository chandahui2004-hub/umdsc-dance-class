export const STYLE_COLOR: Record<string, string> = {
  green: 'var(--c-green)',
  blue: 'var(--c-blue)',
  orange: 'var(--c-orange)',
  pink: 'var(--c-pink)',
  yellow: 'var(--c-yellow)',
  red: 'var(--c-red)',
  navy: 'var(--c-navy)',
  lavender: 'var(--c-lavender)',
  peach: 'var(--c-peach)',
  darkgreen: 'var(--c-darkgreen)',
  brown: 'var(--c-brown)',
  darkpurple: 'var(--c-darkpurple)',
  grey: 'var(--c-grey)',
  darkgrey: 'var(--c-darkgrey)'
};

export function getStyleColor(colorKey?: string): string {
  if (!colorKey) return 'var(--c-ink)';
  const trimmed = colorKey.trim();
  if (trimmed.startsWith('#')) return trimmed;
  return STYLE_COLOR[trimmed.toLowerCase()] || `var(--c-${trimmed.toLowerCase()})` || 'var(--c-ink)';
}

export function getInstructorColor(instructor?: { color?: string } | null, fallback = 'var(--neon-orange)'): string {
  if (!instructor?.color || !instructor.color.trim()) return fallback;
  return getStyleColor(instructor.color);
}
