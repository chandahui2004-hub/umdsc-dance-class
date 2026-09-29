export type Field = 'fullName' | 'matric' | 'contact' | 'email' | 'gender' | 'nationality';

const SYNONYMS: Record<Field, string[]> = {
  fullName: ['full name', 'name', 'nama', 'nama penuh'],
  matric: ['matric number', 'matric no', 'matrik', 'student id', 'no matrik'],
  contact: ['contact number', 'phone', 'phone number', 'whatsapp', 'whatsapp no', 'tel', 'mobile'],
  email: ['email', 'email address', 'e mail', 'e mail address'],
  gender: ['gender', 'sex', 'jantina'],
  nationality: ['nationality', 'citizenship', 'warganegara']
};

export const FIELDS: Field[] = ['fullName', 'matric', 'contact', 'email', 'gender', 'nationality'];

function normalizeHeader(raw: string): string {
  if (!raw) return '';
  const firstLine = String(raw).split('\n')[0];
  return firstLine
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBigrams(str: string): Set<string> {
  const s = str.replace(/\s+/g, '');
  const bigrams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.slice(i, i + 2));
  }
  return bigrams;
}

function diceBigram(a: string, b: string): number {
  if (a === b) return 1.0;
  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function scoreHeaderAgainstField(header: string, field: Field): number {
  const norm = normalizeHeader(header);
  if (!norm) return 0;

  const synonyms = SYNONYMS[field];
  for (const syn of synonyms) {
    const pattern = new RegExp(`(^|\\s)${syn}(\\s|$)`, 'i');
    if (pattern.test(norm)) {
      return 1.0;
    }
  }

  let maxDice = 0;
  for (const syn of synonyms) {
    const d = diceBigram(norm, syn);
    if (d > maxDice) maxDice = d;
  }

  return maxDice;
}

export function matchHeaders(headers: string[]): {
  map: Record<Field, number | null>;
  scores: Record<Field, number>;
} {
  const map: Record<Field, number | null> = {
    fullName: null,
    matric: null,
    contact: null,
    email: null,
    gender: null,
    nationality: null
  };

  const scores: Record<Field, number> = {
    fullName: 0,
    matric: 0,
    contact: 0,
    email: 0,
    gender: 0,
    nationality: 0
  };

  const candidates: Array<{ field: Field; colIdx: number; score: number }> = [];

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx];
    for (const field of FIELDS) {
      const score = scoreHeaderAgainstField(header, field);
      if (score >= 0.6) {
        candidates.push({ field, colIdx, score });
      }
    }
  }

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  const usedCols = new Set<number>();

  for (const cand of candidates) {
    if (map[cand.field] === null && !usedCols.has(cand.colIdx)) {
      map[cand.field] = cand.colIdx;
      scores[cand.field] = cand.score;
      usedCols.add(cand.colIdx);
    }
  }

  return { map, scores };
}
