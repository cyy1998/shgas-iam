import { router } from "@iam/api-core/trpc";
import * as ops from "./client.ops";

export const clientAdminRouter = router({
  search: ops.searchClientOp.toTRPC(),
  detail: ops.getClientOp.toTRPC(),
  create: ops.createClientOp.toTRPC(),
  update: ops.updateClientOp.toTRPC(),
  updateStatus: ops.updateClientStatusOp.toTRPC(),
  delete: ops.deleteClientOp.toTRPC(),
});
