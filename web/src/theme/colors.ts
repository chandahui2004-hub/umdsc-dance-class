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
  return STYLE_COLOR[colorKey.toLowerCase()] || 'var(--c-ink)';
}
