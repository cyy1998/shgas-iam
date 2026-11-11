import { createPasswordLoginCredential } from "@sso/lib/login-credential";
import type { LoginPasswordResult } from "@sso/types/api";
import { request } from "@sso/utils/request";
import { imageCaptchaProofOptions } from "./image-captcha";

export function login(
  body: {
    username: string;
    password: string;
    capToken?: string;
  },
  options: { suppressErrorMessage?: boolean; imageCaptchaProof?: string } = {},
) {
  return request<LoginPasswordResult>("/auth/login/password", {
    ...imageCaptchaProofOptions(options.imageCaptchaProof),
    method: "POST",
    suppressErrorMessage: options.suppressErrorMessage,
    body: JSON.stringify({
      credential: createPasswordLoginCredential({
        username: body.username,
        password: body.password,
      }),
      capToken: body.capToken,
    }),
  });
}

export function mobileLogin(
  body: {
    phoneNumber: string;
    code: string;
    capToken?: string;
  },
  options: { suppressErrorMessage?: boolean; imageCaptchaProof?: string } = {},
) {
  return request<LoginPasswordResult>("/auth/login/mobile", {
    ...imageCaptchaProofOptions(options.imageCaptchaProof),
    method: "POST",
    suppressErrorMessage: options.suppressErrorMessage,
    body: JSON.stringify(body),
  });
}

export function logout() {
  return request<void>("/auth/logout", { method: "POST" });
}
