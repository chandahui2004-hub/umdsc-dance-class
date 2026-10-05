/**
 * Client-side permission helper matching API logic:
 * returns true if perms[code] is '*' or (if styleId given) includes styleId.
 */
export function can(perms: any, code: string, styleId?: string): boolean {
  if (!perms) return false;
  const val = perms[code];
  if (!val) return false;
  if (val === '*') return true;
  if (Array.isArray(val)) {
    if (!styleId) return val.length > 0;
    return val.includes(styleId);
  }
  return false;
}
