/** Reads a YouTube ISO-8601 duration such as PT3M34S or PT1H2M3S as seconds; anything else is 0. */
export function parseIsoDurationSeconds(iso: string): number {
  const match = /^P(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso || '');
  if (!match) return 0;
  const [, h, m, s] = match;
  return Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0);
}
