import { Ctx } from '../ports';

export function sanitizeAuditDetail(detail: any): string {
  if (detail === null || detail === undefined) return '';
  if (typeof detail === 'string') {
    if (detail.startsWith('data:image/')) {
      return `[base64 image: ${detail.length} chars]`;
    }
    return detail.length > 5000 ? detail.slice(0, 4900) + '...[truncated]' : detail;
  }
  if (typeof detail === 'object') {
    try {
      const clean: any = Array.isArray(detail) ? [...detail] : { ...detail };
      for (const k of Object.keys(clean)) {
        if (typeof clean[k] === 'string' && clean[k].length > 300) {
          if (clean[k].startsWith('data:image/')) {
            clean[k] = `[base64 image: ${clean[k].length} chars]`;
          } else if (clean[k].length > 1000) {
            clean[k] = clean[k].slice(0, 500) + '...[truncated]';
          }
        }
      }
      const str = JSON.stringify(clean);
      return str.length > 5000 ? str.slice(0, 4900) + '...[truncated]' : str;
    } catch {
      return String(detail).slice(0, 5000);
    }
  }
  return String(detail).slice(0, 5000);
}

export function logAudit(
  ctx: Ctx,
  actor: string,
  action: string,
  target: string,
  detail: any = ''
): void {
  const safeDetail = sanitizeAuditDetail(detail);
  ctx.db.auditLog.insert(
    {
      ts: ctx.now().toISOString(),
      actor,
      action,
      target,
      detail: safeDetail
    },
    actor,
    ctx.now()
  );
}

