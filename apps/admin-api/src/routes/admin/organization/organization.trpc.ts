import { router } from "@iam/api-core/trpc";
import * as ops from "./organization.ops";

export const organizationAdminRouter = router({
  search: ops.searchOrganizationOp.toTRPC(),
  children: ops.getOrganizationChildrenOp.toTRPC(),
  selector: ops.getOrganizationSelectorOp.toTRPC(),
  detail: ops.getOrganizationOp.toTRPC(),
  create: ops.createOrganizationOp.toTRPC(),
  update: ops.updateOrganizationOp.toTRPC(),
  updateStatus: ops.updateOrganizationStatusOp.toTRPC(),
  delete: ops.deleteOrganizationOp.toTRPC(),
});
