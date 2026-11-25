import type { AuditLogInput } from "@iam/contracts/audit";
import { maskMobileForAudit } from "@iam/domain/audit";
import type { InternalAuditActor } from "@integration-api/services/audit/audit.context";

export function buildInternalPurveyorRegisterAudit(
  actor: InternalAuditActor,
  input: { orgCode: string; orgName: string; parentOrg: string | null; orgType: string },
): AuditLogInput {
  return {
    action: "internal.purveyor.register",
    outcome: "success",
    ...actor,
    targetType: "organization",
    targetCode: input.orgCode,
    details: input,
  };
}

export function buildInternalPurveyorContactRegisterAudit(
  actor: InternalAuditActor,
  input: {
    targetUserId: number | null;
    username: string;
    name: string;
    mobile: string | null;
    orgCode: string;
    existingContact: boolean;
  },
): AuditLogInput {
  return {
    action: "internal.purveyor_contact.register",
    outcome: "success",
    ...actor,
    targetType: "user",
    targetId: input.targetUserId,
    targetCode: input.username,
    details: {
      username: input.username,
      name: input.name,
      mobile: maskMobileForAudit(input.mobile),
      orgCode: input.orgCode,
      existingContact: input.existingContact,
    },
  };
}
