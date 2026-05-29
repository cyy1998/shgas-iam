import type { AuditRouteHandler } from "./audit.type";
import * as ops from "./audit.ops";

export const auditLogsSearch: AuditRouteHandler<"auditLogsSearch"> = async c =>
  c.json(await ops.searchAuditLogsOp.run(c.req.valid("json")));
