import type { AuditLogInput, InternalAuditActor } from "@api/services/audit/audit.context";
import { maskMobileForAudit } from "@iam/domain/audit";

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
    mobile: string;
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
