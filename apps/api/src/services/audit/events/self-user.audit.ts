import type { AuditLogInput } from "@api/services/audit/audit.context";
import { maskMobileForAudit } from "@iam/domain/audit";

type UserAuditTarget = {
  id: number;
  username: string;
  name?: string | null;
};

export function buildSelfPasswordChangeFailureAudit(user: UserAuditTarget): AuditLogInput {
  return {
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
  };
}

export function buildSelfPasswordChangeSuccessAudit(user: UserAuditTarget): AuditLogInput {
  return {
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
  };
}

export function buildPasswordResetFailureAudit(
  user: UserAuditTarget,
  phoneNumber: string,
  reason: "mobile_mismatch" | "invalid_verification_code",
): AuditLogInput {
  return {
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
  };
}

export function buildPasswordResetSuccessAudit(user: UserAuditTarget, phoneNumber: string): AuditLogInput {
  return {
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
  };
}

export function buildMobileBindInvalidCodeAudit(userId: number, phoneNumber: string): AuditLogInput {
  return {
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
  };
}

export function buildMobileBindSuccessAudit(userId: number, phoneNumber: string): AuditLogInput {
  return {
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
  };
}
