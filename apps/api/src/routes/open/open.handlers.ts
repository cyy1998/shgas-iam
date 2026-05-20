import type { OpenRouteHandler } from "./open.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import * as clientService from "@api/services/client/client.service";
import * as humanVerification from "@api/services/human-verification/cap.service";
import * as humanRiskService from "@api/services/human-verification/human-risk.service";
import * as mobileService from "@api/services/mobile/mobile.service";
import * as userService from "@api/services/user/user.service";
import { CustomError } from "@iam/api-core/errors/CustomError";
import * as resp from "@iam/api-core/http";
import { maskMobile, requirePhoneNumber, resolveResetPasswordMobile } from "./open.service";

type HeaderContext = {
  req: {
    header: (name: string) => string | undefined;
  };
};

function getRequestIp(c: HeaderContext) {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor
    ?? c.req.header("x-real-ip")
    ?? c.req.header("cf-connecting-ip")
    ?? undefined;
}

function getVerificationContext(c: HeaderContext, subject?: string) {
  return {
    subject,
    ip: getRequestIp(c),
    client: c.req.header("Client"),
  };
}

export const clientStatus: OpenRouteHandler<"clientStatus"> = async (c) => {
  const { clientCode } = c.req.valid("query");
  const data = await clientService.getClientByCode(clientCode);
  return c.json(resp.ok(data));
};

export const userInfo: OpenRouteHandler<"userInfo"> = async (c) => {
  const { username, capToken } = c.req.valid("query");
  const context = getVerificationContext(c, username);
  await humanVerification.ensureActionAllowed(
    humanVerification.HumanVerificationAction.OpenUserInfoLookup,
    capToken,
    context,
  );
  await humanRiskService.recordOpenUserInfoLookup(username, context);
  const data = await userService.getUserDetailByUsername(username);
  return c.json(resp.ok({
    username: data.username,
    name: data.name,
    mobile: maskMobile(data.mobile),
  }));
};

export const codeSend: OpenRouteHandler<"codeSend"> = async (c) => {
  const { phoneNumber, username, usage, capToken } = c.req.valid("json");
  await humanVerification.ensureActionAllowed(
    humanVerification.HumanVerificationAction.SendSmsCode,
    capToken,
    getVerificationContext(c, phoneNumber ?? username),
  );
  const targetPhoneNumber = usage === VerificationCodeUsage.ResetPassword
    ? await resolveResetPasswordMobile(username, phoneNumber)
    : requirePhoneNumber(phoneNumber);
  const data = await mobileService.sendCode(targetPhoneNumber, usage);
  return c.json(resp.ok(data));
};

export const codeVerify: OpenRouteHandler<"codeVerify"> = async (c) => {
  const { phoneNumber, username, usage, code } = c.req.valid("json");
  const targetPhoneNumber = usage === VerificationCodeUsage.ResetPassword
    ? await resolveResetPasswordMobile(username, phoneNumber)
    : requirePhoneNumber(phoneNumber);
  const data = await mobileService.checkVerificationCode(usage, targetPhoneNumber, code);
  return c.json(resp.ok({ result: data }));
};

export const passwordReset: OpenRouteHandler<"passwordReset"> = async (c) => {
  const { username, phoneNumber, code, newPassword } = c.req.valid("json");
  const targetPhoneNumber = await resolveResetPasswordMobile(username, phoneNumber);
  const data = await userService.resetPassword(username, targetPhoneNumber, code, newPassword);
  return c.json(resp.ok(data));
};

export const capChallenge: OpenRouteHandler<"capChallenge"> = async (c) => {
  const { siteKey } = c.req.valid("param");
  if (!humanVerification.isValidSiteKey(siteKey)) {
    throw new CustomError("无效人机校验站点");
  }
  return c.json(await humanVerification.createChallenge());
};

export const capRedeem: OpenRouteHandler<"capRedeem"> = async (c) => {
  const { siteKey } = c.req.valid("param");
  if (!humanVerification.isValidSiteKey(siteKey)) {
    throw new CustomError("无效人机校验站点");
  }
  const action = c.req.header("X-Cap-Action");
  const result = await humanVerification.redeemChallenge(c.req.valid("json"), action);
  return c.json(result);
};
