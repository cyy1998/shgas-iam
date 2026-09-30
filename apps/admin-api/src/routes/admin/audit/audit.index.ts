import type { AdminBindings } from "@admin-api/types/lib";
import { createRouter } from "@iam/api-core/core/create-router";
import type { AuditAdapter } from "./audit.adapter";
import * as routes from "./audit.routes";

export function createAuditRoute(adapter: AuditAdapter) {
  return createRouter<AdminBindings>().basePath("/audit-logs").openapi(routes.auditLogsSearch, adapter.auditLogsSearch);
}
