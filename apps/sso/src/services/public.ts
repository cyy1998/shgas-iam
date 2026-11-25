import { CustomSsoSubjectProjectionSchema } from "@iam/custom-sso/wire";
import { request } from "@sso/utils/request";
import { submitSmsCode } from "./submit-sms-code";

export async function getCurrentUserInfo() {
  const response = await request<unknown>("/sso/user-info", { suppressErrorMessage: true });
  return CustomSsoSubjectProjectionSchema.parse(response);
}

export function passwordChange(body: { oldPassword: string; newPassword: string }) {
  return request<void>("/auth/account/password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function mobileSet(body: { phoneNumber: string; code: string }) {
  return submitSmsCode("/auth/account/mobile", body, "重新获取验证码");
}
