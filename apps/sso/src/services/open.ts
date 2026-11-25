import type { ClientStatusResult, MaskedMobile, SmsUsage } from "@sso/types/api";
import { request } from "@sso/utils/request";
import { toQueryString } from "@sso/utils/url";
import { imageCaptchaProofOptions } from "./image-captcha";
import { submitSmsCode } from "./submit-sms-code";

export function sendMessage(
  body: { phoneNumber?: string; username?: string; usage: SmsUsage; capToken?: string },
  imageCaptchaProof?: string,
) {
  return request<void>("/auth/sms/send", {
    ...imageCaptchaProofOptions(imageCaptchaProof),
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function selfMobileSendMsg(
  body: { phoneNumber: string; usage: SmsUsage; capToken?: string },
  imageCaptchaProof?: string,
) {
  return sendMessage(body, imageCaptchaProof);
}

export function codeVerify(body: { phoneNumber?: string; username?: string; usage: SmsUsage; code: string }) {
  return request<{ result: boolean }>("/auth/sms/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function passwordReset(body: { username: string; phoneNumber?: string; code: string; newPassword: string }) {
  return submitSmsCode("/auth/recovery/password-reset", body, "返回上一步重新获取验证码");
}

export function clientStatus(
  { clientCode }: { clientCode: string },
  options?: { suppressErrorMessage?: boolean; signal?: AbortSignal },
) {
  const query = toQueryString({ clientCode });
  return request<ClientStatusResult>(`/auth/client/status?${query}`, {
    skipAuthRedirect: true,
    ...options,
  });
}

export function getMaskedMobile(params: { username: string; capToken?: string }, imageCaptchaProof?: string) {
  const qs = toQueryString({ capToken: params.capToken });
  // The inner encoding preserves opaque usernames, including URL dot segments.
  const username = encodeURIComponent(encodeURIComponent(params.username).replace(/\./g, "%2E"));
  return request<MaskedMobile>(`/auth/recovery/users/${username}/masked-mobile?${qs}`, {
    ...imageCaptchaProofOptions(imageCaptchaProof),
    skipAuthRedirect: true,
  });
}
