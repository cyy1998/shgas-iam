import type { Context } from "hono";
import { maskMobileForAudit } from "@iam/domain/audit";
import * as auditService from "../audit.service";

export async function recordInternalDelegationUpdate(c: Context, id: number, patch: Record<string, unknown>) {
  await auditService.recordAuditLogFromContext(c, {
    action: "internal.delegation.update",
    outcome: "success",
    ...auditService.getInternalAuditActor(c),
    targetType: "delegation",
    targetId: id,
    details: {
      patch,
    },
  });
}

export async function recordInternalDelegationCreate(
  c: Context,
  input: {
    id: number;
    delegatorUsername: string;
    delegateeUsername: string;
    orgCode: string;
    privilegeCodes: string[];
    startTime: Date;
    endTime: Date;
  },
) {
  await auditService.recordAuditLogFromContext(c, {
    action: "internal.delegation.create",
    outcome: "success",
    ...auditService.getInternalAuditActor(c),
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
  });
}

export async function recordInternalPurveyorRegister(
  c: Context,
  input: { orgCode: string; orgName: string; parentOrg: string | null; orgType: string },
) {
  await auditService.recordAuditLogFromContext(c, {
    action: "internal.purveyor.register",
    outcome: "success",
    ...auditService.getInternalAuditActor(c),
    targetType: "organization",
    targetCode: input.orgCode,
    details: input,
  });
}

export async function recordInternalPurveyorContactRegister(
  c: Context,
  input: {
    targetUserId: number | null;
    username: string;
    name: string;
    mobile: string;
    orgCode: string;
    existingContact: boolean;
  },
) {
  await auditService.recordAuditLogFromContext(c, {
    action: "internal.purveyor_contact.register",
    outcome: "success",
    ...auditService.getInternalAuditActor(c),
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
  });
}
