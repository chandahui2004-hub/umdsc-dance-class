export function normalizeMatric(raw: string | number): string {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (!s) return '';

  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    s = Number(s).toFixed(0);
  }

  // Remove trailing /n suffix (e.g. 22004591/1 -> 22004591)
  s = s.replace(/\/\d+$/, '');

  // Trim, uppercase, remove spaces and hyphens
  s = s.toUpperCase().replace(/[\s-]/g, '');

  return s;
}

export function nameKey(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(raw: string | number): { value: string; repaired: boolean } {
  if (raw === null || raw === undefined) return { value: '', repaired: false };
  let s = String(raw).trim();
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    s = Number(s).toFixed(0);
  }

  const digits = s.replace(/\D/g, '');
  if (/^1\d{8,9}$/.test(digits)) {
    return { value: '0' + digits, repaired: true };
  }

  return { value: digits, repaired: false };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

function extractTokens(raw: string): string[] {
  const cleaned = raw
    .toLowerCase()
    .replace(/\b(bin|binti|bt|a\/l|a\/p|al|ap)\b/g, ' ');

  const normalized = nameKey(cleaned);
  const ignored = new Set(['bin', 'binti', 'bt', 'al', 'ap']);
  return normalized.split(' ').filter(t => t.length > 0 && !ignored.has(t));
}

export function nameSimilarity(a: string, b: string): number {
  const tokensA = extractTokens(a);
  const tokensB = extractTokens(b);

  if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  const strA = tokensA.join(' ');
  const strB = tokensB.join(' ');

  const sortedA = [...tokensA].sort().join(' ');
  const sortedB = [...tokensB].sort().join(' ');

  const maxLenRaw = Math.max(strA.length, strB.length, 1);
  const levSim = 1 - levenshtein(strA, strB) / maxLenRaw;

  const maxLenSorted = Math.max(sortedA.length, sortedB.length, 1);
  const sortedLevSim = 1 - levenshtein(sortedA, sortedB) / maxLenSorted;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const intersection = tokensA.filter(t => setB.has(t)).sort();
  const diffA = tokensA.filter(t => !setB.has(t)).sort();
  const diffB = tokensB.filter(t => !setA.has(t)).sort();

  const s0 = intersection.join(' ');
  const s1 = [...intersection, ...diffA].join(' ');
  const s2 = [...intersection, ...diffB].join(' ');

  let tokenSetSim = 0;
  if (s0) {
    const sim = (x: string, y: string) => {
      if (!x && !y) return 1.0;
      if (!x || !y) return 0.0;
      const maxLen = Math.max(x.length, y.length);
      return 1 - levenshtein(x, y) / maxLen;
    };
    tokenSetSim = Math.max(sim(s0, s1), sim(s0, s2), sim(s1, s2));
  }

  return Math.max(levSim, sortedLevSim, tokenSetSim);
}
