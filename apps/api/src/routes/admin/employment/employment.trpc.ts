import { router } from "@api/trpc/trpc";
import * as ops from "./employment.ops";

export const employmentAdminRouter = router({
  search: ops.searchEmploymentOp.toTRPC(),
  detail: ops.getEmploymentOp.toTRPC(),
  create: ops.createEmploymentOp.toTRPC(),
  update: ops.updateEmploymentOp.toTRPC(),
  updateStatus: ops.updateEmploymentStatusOp.toTRPC(),
  delete: ops.deleteEmploymentOp.toTRPC(),
  transfer: ops.transferEmploymentOp.toTRPC(),
  setPrimary: ops.setPrimaryEmploymentOp.toTRPC(),
  resignUser: ops.resignUserOp.toTRPC(),
});
