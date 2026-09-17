import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { ClientService } from "@api/services/client/client.service";
import type { CapService } from "@api/services/human-verification/cap.service";
import type { HumanRiskServicePort } from "@api/services/human-verification/human-verification.port";
import type { MobileService } from "@api/services/mobile/mobile.service";
import type { UserService } from "@api/services/user/user.service";
import type { RequestPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/request-password-reset-code/request-password-reset-code.use-case";
import type { ResetPasswordUseCase } from "@api/use-cases/account-recovery/reset-password/reset-password.use-case";
import type { VerifyPasswordResetCodeUseCase } from "@api/use-cases/account-recovery/verify-password-reset-code/verify-password-reset-code.use-case";
import type { OpenRouteHandler } from "./open.type";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { getApiAuditRequestContext, withApiRequestContext } from "@api/services/audit/audit.context";
import {
  buildSmsCodeSendAudit,
  buildSmsCodeVerifyAudit,
} from "@api/services/audit/events/auth.audit";
import { createHumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import { OK } from "@iam/api-core/core/http-status-codes";
import { InvalidHumanVerificationSiteError } from "@iam/api-core/errors/InvalidHumanVerificationSiteError";
import * as resp from "@iam/api-core/http";
import { maskMobile } from "./open.presenter";
import { requirePhoneNumber } from "./open.validation";

export interface CreateOpenHandlersDeps {
  accountRecovery: {
    requestPasswordResetCode: RequestPasswordResetCodeUseCase;
    resetPassword: ResetPasswordUseCase;
    verifyPasswordResetCode: VerifyPasswordResetCodeUseCase;
  };
  auditLogWriter: AuditLogWriterPort;
  clientService: Pick<ClientService, "getClientByCode">;
  humanVerification: Pick<
    CapService,
    "ensureActionAllowed" | "isValidSiteKey" | "createChallenge" | "redeemChallenge"
  >;
  humanRiskService: Pick<HumanRiskServicePort, "recordOpenUserInfoLookup">;
  mobileService: Pick<MobileService, "sendCode" | "checkVerificationCode">;
  userService: Pick<UserService, "getUserMobileByUsername">;
}

export function createOpenHandlers(deps: CreateOpenHandlersDeps) {
  const clientStatus: OpenRouteHandler<"clientStatus"> = async (c) => {
    const { clientCode } = c.req.valid("query");
    const data = await deps.clientService.getClientByCode(clientCode);
    return c.json(resp.ok(data), OK);
  };

  const maskedMobile: OpenRouteHandler<"maskedMobile"> = async (c) => {
    const { username } = c.req.valid("param");
    const { capToken } = c.req.valid("query");
    const requestContext = getApiAuditRequestContext(c);
    const context = createHumanVerificationContext(requestContext, username);
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.OpenUserInfoLookup,
      capToken,
      context,
    );
    await deps.humanRiskService.recordOpenUserInfoLookup(username, context);
    const mobile = await deps.userService.getUserMobileByUsername(username);
    return c.json(resp.ok({
      mobile: maskMobile(mobile),
    }), OK);
  };

  const codeSend: OpenRouteHandler<"codeSend"> = async (c) => {
    const { phoneNumber, username, usage, capToken } = c.req.valid("json");
    const requestContext = getApiAuditRequestContext(c);
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.SendSmsCode,
      capToken,
      createHumanVerificationContext(requestContext, phoneNumber ?? username),
    );
    if (usage === VerificationCodeUsage.ResetPassword) {
      const data = await deps.accountRecovery.requestPasswordResetCode.execute({ username, phoneNumber }, {
        requestContext,
      });
      return c.json(resp.ok(data), OK);
    }
    const targetPhoneNumber = requirePhoneNumber(phoneNumber);
    const data = await deps.mobileService.sendCode(targetPhoneNumber, usage);
    await deps.auditLogWriter.recordAuditLog(withApiRequestContext(requestContext, buildSmsCodeSendAudit({
      phoneNumber: targetPhoneNumber,
      usage,
      username,
    })));
    return c.json(resp.ok(data), OK);
  };

  const codeVerify: OpenRouteHandler<"codeVerify"> = async (c) => {
    const { phoneNumber, username, usage, code } = c.req.valid("json");
    const requestContext = getApiAuditRequestContext(c);
    if (usage === VerificationCodeUsage.ResetPassword) {
      const data = await deps.accountRecovery.verifyPasswordResetCode.execute({
        code,
        phoneNumber,
        username,
      }, { requestContext });
      return c.json(resp.ok({ result: data }), OK);
    }
    const targetPhoneNumber = requirePhoneNumber(phoneNumber);
    const data = await deps.mobileService.checkVerificationCode(usage, targetPhoneNumber, code);
    await deps.auditLogWriter.recordAuditLog(withApiRequestContext(requestContext, buildSmsCodeVerifyAudit({
      phoneNumber: targetPhoneNumber,
      usage,
      username,
      verified: data,
    })));
    return c.json(resp.ok({ result: data }), OK);
  };

  const passwordReset: OpenRouteHandler<"passwordReset"> = async (c) => {
    const { username, phoneNumber, code, newPassword } = c.req.valid("json");
    const requestContext = getApiAuditRequestContext(c);
    const data = await deps.accountRecovery.resetPassword.execute({
      code,
      newPassword,
      phoneNumber,
      username,
    }, {
      requestContext,
    });
    return c.json(resp.ok(data), OK);
  };

  const capChallenge: OpenRouteHandler<"capChallenge"> = async (c) => {
    const { siteKey } = c.req.valid("param");
    if (!deps.humanVerification.isValidSiteKey(siteKey)) {
      throw new InvalidHumanVerificationSiteError("无效人机校验站点");
    }
    return c.json(await deps.humanVerification.createChallenge(), OK);
  };

  const capRedeem: OpenRouteHandler<"capRedeem"> = async (c) => {
    const { siteKey } = c.req.valid("param");
    if (!deps.humanVerification.isValidSiteKey(siteKey)) {
      throw new InvalidHumanVerificationSiteError("无效人机校验站点");
    }
    const action = c.req.header("X-Cap-Action");
    const result = await deps.humanVerification.redeemChallenge(c.req.valid("json"), action);
    return c.json(result, OK);
  };

  return {
    capChallenge,
    capRedeem,
    clientStatus,
    codeSend,
    codeVerify,
    passwordReset,
    maskedMobile,
  };
}

export type OpenHandlers = ReturnType<typeof createOpenHandlers>;
