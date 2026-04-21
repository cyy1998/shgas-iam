import * as ops from "@/services/position/position.ops";
import { router } from "../../trpc";

export const positionAdminRouter = router({
  search: ops.searchPositionOp.toTRPC(),
  detail: ops.getPositionOp.toTRPC(),
  create: ops.createPositionOp.toTRPC(),
  update: ops.updatePositionOp.toTRPC(),
  updateStatus: ops.updatePositionStatusOp.toTRPC(),
  delete: ops.deletePositionOp.toTRPC(),
});
