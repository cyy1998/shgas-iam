import { router } from "@iam/api-core/trpc";
import * as ops from "./audit.ops";

export const auditAdminRouter = router({
  search: ops.searchAuditLogsOp.toTRPC(),
});
