function lettersOnly(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z]/g, '');
}

export function detectClassColumn(
  rows: string[][],
  styles: { id: string; aliases: string[] }[],
  headers: string[]
): { index: number; hitRate: number } | null {
  if (!rows || rows.length === 0 || !headers || headers.length === 0) {
    return null;
  }

  const normalizedAliases: string[] = [];
  for (const style of styles) {
    for (const alias of style.aliases || []) {
      const norm = lettersOnly(alias);
      if (norm) normalizedAliases.push(norm);
    }
  }

  if (normalizedAliases.length === 0) {
    return null;
  }

  let bestIndex = -1;
  let bestRate = 0;
  let bestHasClassWord = false;

  const numCols = headers.length;

  for (let col = 0; col < numCols; col++) {
    const nonEmpties = rows
      .map(r => r[col])
      .filter(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');

    if (nonEmpties.length === 0) continue;

    let hits = 0;
    for (const cell of nonEmpties) {
      const cellNorm = lettersOnly(String(cell));
      const hasHit = normalizedAliases.some(alias => cellNorm.includes(alias));
      if (hasHit) {
        hits++;
      }
    }

    const hitRate = hits / nonEmpties.length;
    const headerHasClass = /class/i.test(headers[col] || '');

    if (hitRate > bestRate || (hitRate === bestRate && headerHasClass && !bestHasClassWord)) {
      bestRate = hitRate;
      bestIndex = col;
      bestHasClassWord = headerHasClass;
    }
  }

  if (bestRate < 0.5 || bestIndex === -1) {
    return null;
  }

  return { index: bestIndex, hitRate: bestRate };
}

export function parseStyles(
  cell: string,
  styles: { id: string; name: string; aliases: string[] }[]
): { styleIds: string[]; unknownTokens: string[] } {
  if (!cell || typeof cell !== 'string') {
    return { styleIds: [], unknownTokens: [] };
  }

  const parts = cell.split(',');
  const styleIdsSet = new Set<string>();
  const unknownTokens: string[] = [];

  for (const rawPart of parts) {
    const stripped = rawPart
      .replace(/\(.*?\)/g, '')
      .replace(/\bclasses?\b/gi, '')
      .trim();

    if (!stripped) continue;

    const norm = lettersOnly(stripped);
    if (!norm) continue;

    let matchedStyleId: string | null = null;
    for (const style of styles) {
      const styleAliases = (style.aliases || []).map(lettersOnly);
      const styleNameNorm = lettersOnly(style.name);

      if (styleAliases.includes(norm) || norm === styleNameNorm) {
        matchedStyleId = style.id;
        break;
      }
      if (styleAliases.some(alias => norm.includes(alias) || alias.includes(norm))) {
        matchedStyleId = style.id;
        break;
      }
    }

    if (matchedStyleId) {
      styleIdsSet.add(matchedStyleId);
    } else {
      unknownTokens.push(stripped);
    }
  }

  return {
    styleIds: Array.from(styleIdsSet),
    unknownTokens
  };
}
