import type { AuditAdapter } from "./audit.adapter";

export function createAuditAdminRouter(adapter: AuditAdapter) {
  return adapter.auditAdminRouter;
}
