import type { PublicBindings } from "@iam/api-core/types";
import type { AuditAdapter } from "./audit.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./audit.routes";

export function createAuditRoute(adapter: AuditAdapter) {
  return createRouter<PublicBindings>().basePath("/audit-logs").openapi(routes.auditLogsSearch, adapter.auditLogsSearch);
}
