import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { UserStatus } from "@iam/contracts";
import { maskMobileForAudit } from "@iam/domain/audit";
import { buildAdminResourceAudit } from "../admin-resource-audit";

type UserAuditTarget = {
  id: number;
  username: string;
  name?: string | null;
  mobile?: string | null;
  status?: UserStatus;
};

function maskUserAuditDetails(details: Record<string, unknown>) {
  if (!("patch" in details) || details.patch === null || typeof details.patch !== "object") {
    return details;
  }
  const patch = { ...(details.patch as Record<string, unknown>) };
  if ("mobile" in patch) {
    patch.mobile = maskMobileForAudit(patch.mobile as string | null | undefined);
  }
  return {
    ...details,
    patch,
  };
}

export function buildAdminUserAudit(
  action: string,
  user: UserAuditTarget,
  details: Record<string, unknown>,
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildAdminResourceAudit(
    action,
    {
      type: "user",
      id: user.id,
      code: user.username,
      name: user.name,
    },
    {
      targetUsername: user.username,
      targetName: user.name,
      targetMobile: maskMobileForAudit(user.mobile),
      ...maskUserAuditDetails(details),
    },
    auditContext,
  );
}
