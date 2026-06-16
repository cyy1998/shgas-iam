import type { AuditLogInput } from "@api/services/audit/audit.service";
import type { UserDetailDto } from "@api/services/user/user.type";
import type { Context } from "hono";
import { AuditActions, type ClientManagementLevel } from "@iam/contracts";
import { maskMobileForAudit } from "@iam/domain/audit";
import * as auditService from "../audit.service";

type UserAuditTarget = {
  id: number;
  username: string;
  name?: string | null;
};

export async function recordPasswordLoginFailure(
  username: string,
  reason: string,
  user?: UserAuditTarget,
) {
  await auditService.recordAuditLog({
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
  });
}

export async function recordMobileLoginFailure(
  phoneNumber: string,
  reason: string,
  activeUser?: Pick<UserAuditTarget, "id" | "name"> | null,
) {
  await auditService.recordAuditLog({
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
  });
}

export async function recordPasswordLoginSuccess(user: UserDetailDto) {
  await recordUserLoginSuccess(AuditActions["auth.login.password"], user, {
    clientCode: "global",
    loginType: "password",
  });
}

export async function recordMobileLoginSuccess(user: UserDetailDto) {
  await recordUserLoginSuccess(AuditActions["auth.login.mobile"], user, {
    clientCode: "global",
    loginType: "mobile",
  });
}

export async function recordLocalLoginSuccess(
  user: UserDetailDto,
  clientCode: string,
  managementLevel: ClientManagementLevel,
) {
  await recordUserLoginSuccess(AuditActions["auth.login.local"], user, {
    clientCode,
    loginType: "local",
    managementLevel,
  });
}

export async function recordOaLoginSuccess(user: UserDetailDto, clientCode: string) {
  await recordUserLoginSuccess(AuditActions["auth.login.oa"], user, {
    clientCode,
    loginType: "oa",
  });
}

export async function recordWechatLoginSuccess(user: UserDetailDto) {
  await recordUserLoginSuccess(AuditActions["auth.login.wechat"], user, {
    loginType: "wechat",
  });
}

export async function recordSmsCodeSend(
  c: Context,
  input: { phoneNumber: string; usage: string; username?: string },
) {
  await auditService.recordAuditLogFromContext(c, {
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
  });
}

export async function recordSmsCodeVerify(
  c: Context,
  input: { phoneNumber: string; usage: string; username?: string; verified: boolean },
) {
  await auditService.recordAuditLogFromContext(c, {
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
  });
}

async function recordUserLoginSuccess(
  action: string,
  user: UserDetailDto,
  details: AuditLogInput["details"],
) {
  await auditService.recordAuditLog({
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
  });
}
