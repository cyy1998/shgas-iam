import type { ClientStatusResult, MaskedMobile, SmsUsage } from "@sso/types/api";
import { request } from "@sso/utils/request";
import { toQueryString } from "@sso/utils/url";
import { imageCaptchaProofOptions } from "./image-captcha";

export function sendMessage(
  body: { phoneNumber?: string; username?: string; usage: SmsUsage; capToken?: string },
  imageCaptchaProof?: string,
) {
  return request<void>("/open/code/send", {
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
  return request<{ result: boolean }>("/open/code/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function passwordReset(body: { username: string; phoneNumber?: string; code: string; newPassword: string }) {
  return request<void>("/open/password/reset", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function clientStatus(params: { clientCode: string }) {
  const qs = toQueryString(params);
  return request<ClientStatusResult>(`/open/client/status?${qs}`, {
    skipAuthRedirect: true,
  });
}

export function getMaskedMobile(params: { username: string; capToken?: string }, imageCaptchaProof?: string) {
  const qs = toQueryString({ capToken: params.capToken });
  // The inner encoding preserves opaque usernames, including URL dot segments.
  const username = encodeURIComponent(encodeURIComponent(params.username).replace(/\./g, "%2E"));
  return request<MaskedMobile>(`/open/users/${username}/masked-mobile?${qs}`, {
    ...imageCaptchaProofOptions(imageCaptchaProof),
    skipAuthRedirect: true,
  });
}
