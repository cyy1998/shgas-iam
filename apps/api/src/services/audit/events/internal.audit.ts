import type { AuditLogInput } from "@api/services/audit/audit.context";
import { maskMobileForAudit } from "@iam/domain/audit";

export type InternalAuditActor = Pick<
  AuditLogInput,
  "actorType" | "actorUserId" | "actorUsername" | "actorClientCode" | "actorSystemKey"
>;

export function buildInternalDelegationUpdateAudit(
  actor: InternalAuditActor,
  id: number,
  patch: Record<string, unknown>,
): AuditLogInput {
  return {
    action: "internal.delegation.update",
    outcome: "success",
    ...actor,
    targetType: "delegation",
    targetId: id,
    details: {
      patch,
    },
  };
}

export function buildInternalDelegationCreateAudit(
  actor: InternalAuditActor,
  input: {
    id: number;
    delegatorUsername: string;
    delegateeUsername: string;
    orgCode: string;
    privilegeCodes: string[];
    startTime: Date;
    endTime: Date;
  },
): AuditLogInput {
  return {
    action: "internal.delegation.create",
    outcome: "success",
    ...actor,
    targetType: "delegation",
    targetId: input.id,
    details: {
      delegatorUsername: input.delegatorUsername,
      delegateeUsername: input.delegateeUsername,
      orgCode: input.orgCode,
      privilegeCodes: input.privilegeCodes,
      startTime: input.startTime,
      endTime: input.endTime,
    },
  };
}

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
