import { router } from "@/trpc/trpc";
import * as ops from "./organization.ops";

export const organizationAdminRouter = router({
  search: ops.searchOrganizationOp.toTRPC(),
  tree: ops.getOrganizationTreeOp.toTRPC(),
  detail: ops.getOrganizationOp.toTRPC(),
  create: ops.createOrganizationOp.toTRPC(),
  update: ops.updateOrganizationOp.toTRPC(),
  updateStatus: ops.updateOrganizationStatusOp.toTRPC(),
  delete: ops.deleteOrganizationOp.toTRPC(),
});
