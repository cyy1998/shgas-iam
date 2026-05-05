import { router } from "@/trpc/trpc";
import * as ops from "./user.ops";

export const userAdminRouter = router({
  search: ops.searchUserOp.toTRPC(),
  detail: ops.getUserOp.toTRPC(),
  create: ops.createUserOp.toTRPC(),
  update: ops.updateUserOp.toTRPC(),
  updateStatus: ops.updateUserStatusOp.toTRPC(),
  delete: ops.deleteUserOp.toTRPC(),
  resetPassword: ops.resetPasswordOp.toTRPC(),
  generatePassword: ops.generatePasswordOp.toTRPC(),
});
