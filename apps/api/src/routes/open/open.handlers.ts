import type { OpenRouteHandler } from "./open.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import * as clientService from "@api/services/client/client.service";
import * as mobileService from "@api/services/mobile/mobile.service";
import * as userService from "@api/services/user/user.service";
import * as resp from "@iam/api-core/http";
import { maskMobile, requirePhoneNumber, resolveResetPasswordMobile } from "./open.service";

export const clientStatus: OpenRouteHandler<"clientStatus"> = async (c) => {
  const { clientCode } = c.req.valid("query");
  const data = await clientService.getClientByCode(clientCode);
  return c.json(resp.ok(data));
};

export const userInfo: OpenRouteHandler<"userInfo"> = async (c) => {
  const { username } = c.req.valid("query");
  const data = await userService.getUserDetailByUsername(username);
  return c.json(resp.ok({
    username: data.username,
    name: data.name,
    mobile: maskMobile(data.mobile),
  }));
};

export const codeSend: OpenRouteHandler<"codeSend"> = async (c) => {
  const { phoneNumber, username, usage } = c.req.valid("json");
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
