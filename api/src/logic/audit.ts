import { Ctx } from '../ports';

export function logAudit(
  ctx: Ctx,
  actor: string,
  action: string,
  target: string,
  detail: string = ''
): void {
  ctx.db.auditLog.insert(
    {
      ts: ctx.now().toISOString(),
      actor,
      action,
      target,
      detail
    },
    actor,
    ctx.now()
  );
}
