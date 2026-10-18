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
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('var(') ||
    trimmed.startsWith('rgb(') ||
    trimmed.startsWith('rgba(') ||
    trimmed.startsWith('hsl(') ||
    trimmed.startsWith('hsla(')
  ) {
    return trimmed;
  }
  return STYLE_COLOR[trimmed.toLowerCase()] || `var(--c-${trimmed.toLowerCase()})` || 'var(--c-ink)';
}

export function getInstructorColor(
  instructor?: { color?: string; styleColors?: Record<string, string> } | null,
  styleId?: string,
  fallback = 'var(--neon-orange)'
): string {
  if (!instructor) return fallback;
  if (styleId && instructor.styleColors && instructor.styleColors[styleId]) {
    const sc = instructor.styleColors[styleId].trim();
    if (sc) return getStyleColor(sc);
  }
  if (instructor.color && instructor.color.trim()) {
    return getStyleColor(instructor.color);
  }
  return fallback;
}
