export function isMemberEnrolledInStyle(
  member: { styleIds?: string[]; styleNames?: string[] },
  targetStyleIdOrName: string,
  styles: { id: string; name: string; aliases?: string[] }[] = []
): boolean {
  if (!targetStyleIdOrName) return false;
  const targetLower = targetStyleIdOrName.trim().toLowerCase();

  // Find style object if target matches id or name
  const matchedStyle = styles.find(
    s => s.id.toLowerCase() === targetLower || s.name.toLowerCase() === targetLower
  );

  // Set of all allowed tokens for this target style
  const targetTokens = new Set<string>([
    targetLower,
    ...(matchedStyle
      ? [
          matchedStyle.id.toLowerCase(),
          matchedStyle.name.toLowerCase(),
          ...(matchedStyle.aliases || []).map(a => a.toLowerCase().trim())
        ]
      : [])
  ]);

  // All tokens associated with the member
  const memberTokens = [
    ...(member.styleIds || []),
    ...(member.styleNames || [])
  ]
    .map(t => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  if (memberTokens.length === 0) return false;

  // Direct token match
  if (memberTokens.some(t => targetTokens.has(t))) {
    return true;
  }

  // Substring matching (e.g. "Locking (Thu)" contains "locking")
  for (const mToken of memberTokens) {
    for (const tToken of targetTokens) {
      if (tToken.length >= 3 && (mToken.includes(tToken) || tToken.includes(mToken))) {
        return true;
      }
    }
  }

  return false;
}
