import type { AuditLogInput } from "@api/services/audit/audit.service";
import type { UserDetailDto } from "@api/services/user/user.type";
import type { ClientManagementLevel } from "@iam/contracts";
import { AuditActions } from "@iam/contracts";
import { maskMobileForAudit } from "@iam/domain/audit";

type UserAuditTarget = {
  id: number;
  username: string;
  name?: string | null;
};

export function buildPasswordLoginFailureAudit(
  username: string,
  reason: string,
  user?: UserAuditTarget,
): AuditLogInput {
  return {
    action: AuditActions["auth.login.password"],
    outcome: "failure",
    actorType: "anonymous",
    targetType: "user",
    targetId: user?.id ?? null,
    targetCode: user?.username ?? username,
    targetName: user?.name ?? null,
    details: {
      reason,
      username,
    },
  };
}

export function buildMobileLoginFailureAudit(
  phoneNumber: string,
  reason: string,
  activeUser?: Pick<UserAuditTarget, "id" | "name"> | null,
): AuditLogInput {
  return {
    action: AuditActions["auth.login.mobile"],
    outcome: "failure",
    actorType: "anonymous",
    targetType: activeUser ? "user" : "mobile",
    targetId: activeUser?.id ?? null,
    targetCode: maskMobileForAudit(phoneNumber),
    targetName: activeUser?.name ?? null,
    details: {
      phoneNumber: maskMobileForAudit(phoneNumber),
      reason,
    },
  };
}

export function buildPasswordLoginSuccessAudit(user: UserDetailDto) {
  return buildUserLoginSuccessAudit(AuditActions["auth.login.password"], user, {
    clientCode: "global",
    loginType: "password",
  });
}

export function buildMobileLoginSuccessAudit(user: UserDetailDto) {
  return buildUserLoginSuccessAudit(AuditActions["auth.login.mobile"], user, {
    clientCode: "global",
    loginType: "mobile",
  });
}

export function buildLocalLoginSuccessAudit(
  user: UserDetailDto,
  clientCode: string,
  managementLevel: ClientManagementLevel,
) {
  return buildUserLoginSuccessAudit(AuditActions["auth.login.local"], user, {
    clientCode,
    loginType: "local",
    managementLevel,
  });
}

export function buildOaLoginSuccessAudit(user: UserDetailDto, clientCode: string) {
  return buildUserLoginSuccessAudit(AuditActions["auth.login.oa"], user, {
    clientCode,
    loginType: "oa",
  });
}

export function buildWechatLoginSuccessAudit(user: UserDetailDto) {
  return buildUserLoginSuccessAudit(AuditActions["auth.login.wechat"], user, {
    loginType: "wechat",
  });
}

export function buildSmsCodeSendAudit(
  input: { phoneNumber: string; usage: string; username?: string },
): AuditLogInput {
  return {
    action: "auth.sms_code.send",
    outcome: "success",
    actorType: "anonymous",
    targetType: "mobile",
    targetCode: maskMobileForAudit(input.phoneNumber),
    details: {
      phoneNumber: maskMobileForAudit(input.phoneNumber),
      usage: input.usage,
      username: input.username,
    },
  };
}

export function buildSmsCodeVerifyAudit(
  input: { phoneNumber: string; usage: string; username?: string; verified: boolean },
): AuditLogInput {
  return {
    action: "auth.sms_code.verify",
    outcome: input.verified ? "success" : "failure",
    actorType: "anonymous",
    targetType: "mobile",
    targetCode: maskMobileForAudit(input.phoneNumber),
    details: {
      phoneNumber: maskMobileForAudit(input.phoneNumber),
      usage: input.usage,
      username: input.username,
    },
  };
}

function buildUserLoginSuccessAudit(
  action: string,
  user: UserDetailDto,
  details: AuditLogInput["details"],
): AuditLogInput {
  return {
    action,
    outcome: "success",
    actorType: "user",
    actorUserId: user.id,
    actorUsername: user.username,
    targetType: "user",
    targetId: user.id,
    targetCode: user.username,
    targetName: user.name,
    details,
  };
}
