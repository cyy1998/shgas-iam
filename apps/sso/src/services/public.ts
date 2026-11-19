import { CustomSsoSubjectProjectionSchema } from "@iam/custom-sso/wire";
import { request } from "@sso/utils/request";
import { submitSmsCode } from "./submit-sms-code";

export async function getCurrentUserInfo() {
  const response = await request<unknown>("/public/user-info", { suppressErrorMessage: true });
  return CustomSsoSubjectProjectionSchema.parse(response);
}

export function passwordChange(body: { oldPassword: string; newPassword: string }) {
  return request<void>("/public/password/change", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function mobileSet(body: { phoneNumber: string; code: string }) {
  return submitSmsCode("/public/mobile/set", body, "重新获取验证码");
}
