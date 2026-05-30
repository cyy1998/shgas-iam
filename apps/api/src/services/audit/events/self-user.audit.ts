import type { AuditLogInput } from "@api/services/audit/audit.service";
import type { DbClient } from "@iam/db";
import { maskMobileForAudit } from "@iam/domain/audit";
import * as auditService from "../audit.service";

type UserAuditTarget = {
  id: number;
  username: string;
  name?: string | null;
};

export async function recordSelfPasswordChangeFailure(user: UserAuditTarget, tx?: DbClient) {
  await auditService.recordAuditLog({
    action: "self.password.change",
    outcome: "failure",
    actorType: "user",
    actorUserId: user.id,
    actorUsername: user.username,
    targetType: "user",
    targetId: user.id,
    targetCode: user.username,
    targetName: user.name,
    details: {
      reason: "invalid_old_password",
    },
  }, tx);
}

export async function recordSelfPasswordChangeSuccess(user: UserAuditTarget, tx?: DbClient) {
  await auditService.recordAuditLog({
    action: "self.password.change",
    outcome: "success",
    actorType: "user",
    actorUserId: user.id,
    actorUsername: user.username,
    targetType: "user",
    targetId: user.id,
    targetCode: user.username,
    targetName: user.name,
    details: {
      passwordChanged: true,
    },
  }, tx);
}

export async function recordPasswordResetFailure(
  user: UserAuditTarget,
  phoneNumber: string,
  reason: "mobile_mismatch" | "invalid_verification_code",
  tx?: DbClient,
) {
  await auditService.recordAuditLog({
    action: "auth.password.reset",
    outcome: "failure",
    actorType: "anonymous",
    targetType: "user",
    targetId: user.id,
    targetCode: user.username,
    targetName: user.name,
    details: {
      phoneNumber: maskMobileForAudit(phoneNumber),
      reason,
    },
  }, tx);
}

export async function recordPasswordResetSuccess(user: UserAuditTarget, phoneNumber: string, tx?: DbClient) {
  await auditService.recordAuditLog({
    action: "auth.password.reset",
    outcome: "success",
    actorType: "anonymous",
    targetType: "user",
    targetId: user.id,
    targetCode: user.username,
    targetName: user.name,
    details: {
      phoneNumber: maskMobileForAudit(phoneNumber),
      passwordReset: true,
    },
  }, tx);
}

export async function recordMobileBindInvalidCode(userId: number, phoneNumber: string, tx?: DbClient) {
  await auditService.recordAuditLog({
    action: "self.mobile.bind",
    outcome: "failure",
    actorType: "user",
    actorUserId: userId,
    targetType: "user",
    targetId: userId,
    targetCode: maskMobileForAudit(phoneNumber),
    details: {
      phoneNumber: maskMobileForAudit(phoneNumber),
      reason: "invalid_verification_code",
    },
  } satisfies AuditLogInput, tx);
}

export async function recordMobileBindSuccess(userId: number, phoneNumber: string, tx?: DbClient) {
  await auditService.recordAuditLog({
    action: "self.mobile.bind",
    outcome: "success",
    actorType: "user",
    actorUserId: userId,
    targetType: "user",
    targetId: userId,
    targetCode: maskMobileForAudit(phoneNumber),
    details: {
      phoneNumber: maskMobileForAudit(phoneNumber),
    },
  } satisfies AuditLogInput, tx);
}
