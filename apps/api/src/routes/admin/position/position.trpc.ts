import { router } from "@/routes/trpc/trpc";
import * as ops from "./position.ops";

export const positionAdminRouter = router({
  search: ops.searchPositionOp.toTRPC(),
  detail: ops.getPositionOp.toTRPC(),
  create: ops.createPositionOp.toTRPC(),
  update: ops.updatePositionOp.toTRPC(),
  updateStatus: ops.updatePositionStatusOp.toTRPC(),
  delete: ops.deletePositionOp.toTRPC(),
});
