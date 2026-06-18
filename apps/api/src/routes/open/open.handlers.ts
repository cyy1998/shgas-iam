import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { ClientService } from "@api/services/client/client.service";
import type { CapService } from "@api/services/human-verification/cap.service";
import type { HumanRiskServicePort } from "@api/services/human-verification/human-verification.port";
import type { MobileService } from "@api/services/mobile/mobile.service";
import type { UserService } from "@api/services/user/user.service";
import type { OpenService } from "./open.service";
import type { OpenRouteHandler } from "./open.type";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import {
  buildSmsCodeSendAudit,
  buildSmsCodeVerifyAudit,
} from "@api/services/audit/events/auth.audit";
import { InvalidHumanVerificationSiteError } from "@iam/api-core/errors/InvalidHumanVerificationSiteError";
import * as resp from "@iam/api-core/http";
import { getVerificationContext } from "../human-verification-context";

export interface CreateOpenHandlersDeps {
  auditLogWriter: AuditLogWriterPort;
  clientService: Pick<ClientService, "getClientByCode">;
  humanVerification: Pick<
    CapService,
    "ensureActionAllowed" | "isValidSiteKey" | "createChallenge" | "redeemChallenge"
  >;
  humanRiskService: Pick<HumanRiskServicePort, "recordOpenUserInfoLookup">;
  mobileService: Pick<MobileService, "sendCode" | "checkVerificationCode">;
  openService: Pick<OpenService, "maskMobile" | "requirePhoneNumber" | "resolveResetPasswordMobile">;
  userService: Pick<UserService, "getUserDetailByUsername" | "resetPassword">;
}

export function createOpenHandlers(deps: CreateOpenHandlersDeps) {
  const clientStatus: OpenRouteHandler<"clientStatus"> = async (c) => {
    const { clientCode } = c.req.valid("query");
    const data = await deps.clientService.getClientByCode(clientCode);
    return c.json(resp.ok(data));
  };

  const userInfo: OpenRouteHandler<"userInfo"> = async (c) => {
    const { username, capToken } = c.req.valid("query");
    const context = getVerificationContext(c, username);
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.OpenUserInfoLookup,
      capToken,
      context,
    );
    await deps.humanRiskService.recordOpenUserInfoLookup(username, context);
    const data = await deps.userService.getUserDetailByUsername(username);
    return c.json(resp.ok({
      username: data.username,
      name: data.name,
      mobile: deps.openService.maskMobile(data.mobile),
    }));
  };

  const codeSend: OpenRouteHandler<"codeSend"> = async (c) => {
    const { phoneNumber, username, usage, capToken } = c.req.valid("json");
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.SendSmsCode,
      capToken,
      getVerificationContext(c, phoneNumber ?? username),
    );
    const targetPhoneNumber = usage === VerificationCodeUsage.ResetPassword
      ? await deps.openService.resolveResetPasswordMobile(username, phoneNumber)
      : deps.openService.requirePhoneNumber(phoneNumber);
    const data = await deps.mobileService.sendCode(targetPhoneNumber, usage);
    await deps.auditLogWriter.recordAuditLogFromContext(c, buildSmsCodeSendAudit({
      phoneNumber: targetPhoneNumber,
      usage,
      username,
    }));
    return c.json(resp.ok(data));
  };

  const codeVerify: OpenRouteHandler<"codeVerify"> = async (c) => {
    const { phoneNumber, username, usage, code } = c.req.valid("json");
    const targetPhoneNumber = usage === VerificationCodeUsage.ResetPassword
      ? await deps.openService.resolveResetPasswordMobile(username, phoneNumber)
      : deps.openService.requirePhoneNumber(phoneNumber);
    const data = await deps.mobileService.checkVerificationCode(usage, targetPhoneNumber, code);
    await deps.auditLogWriter.recordAuditLogFromContext(c, buildSmsCodeVerifyAudit({
      phoneNumber: targetPhoneNumber,
      usage,
      username,
      verified: data,
    }));
    return c.json(resp.ok({ result: data }));
  };

  const passwordReset: OpenRouteHandler<"passwordReset"> = async (c) => {
    const { username, phoneNumber, code, newPassword } = c.req.valid("json");
    const targetPhoneNumber = await deps.openService.resolveResetPasswordMobile(username, phoneNumber);
    const data = await deps.userService.resetPassword(username, targetPhoneNumber, code, newPassword);
    return c.json(resp.ok(data));
  };

  const capChallenge: OpenRouteHandler<"capChallenge"> = async (c) => {
    const { siteKey } = c.req.valid("param");
    if (!deps.humanVerification.isValidSiteKey(siteKey)) {
      throw new InvalidHumanVerificationSiteError("无效人机校验站点");
    }
    return c.json(await deps.humanVerification.createChallenge());
  };

  const capRedeem: OpenRouteHandler<"capRedeem"> = async (c) => {
    const { siteKey } = c.req.valid("param");
    if (!deps.humanVerification.isValidSiteKey(siteKey)) {
      throw new InvalidHumanVerificationSiteError("无效人机校验站点");
    }
    const action = c.req.header("X-Cap-Action");
    const result = await deps.humanVerification.redeemChallenge(c.req.valid("json"), action);
    return c.json(result);
  };

  return {
    capChallenge,
    capRedeem,
    clientStatus,
    codeSend,
    codeVerify,
    passwordReset,
    userInfo,
  };
}

export type OpenHandlers = ReturnType<typeof createOpenHandlers>;
