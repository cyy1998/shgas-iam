import { ClientStatus, LoginPageGuardDecision } from "@iam/contracts";
import { HttpResponse, http } from "msw";
import { authenticationConfig, currentUserInfo, resetPasswordMaskedMobile } from "./fixtures";

function ok<T>(data: T) {
  return HttpResponse.json({ code: 200, message: "OK", data });
}

export const handlers = [
  http.get("*/sso/login-guard", () => ok({ decision: LoginPageGuardDecision.Login })),
  http.get("*/sso/.well-known/authentication-configuration", () => ok(authenticationConfig)),
  http.get("*/api/iam/sso/user-info", () => ok(currentUserInfo)),
  http.post("*/api/iam/delegations/search", () => ok([])),
  http.post("*/api/iam/auth/sms/send", () => ok(null)),
  http.get("*/api/iam/auth/client/status", () =>
    ok({
      clientCode: "iam-admin",
      clientName: "IAM 管理后台",
      status: ClientStatus.Enable,
      url: null,
    }),
  ),
  http.get("*/api/iam/auth/recovery/users/:username/masked-mobile", () => ok(resetPasswordMaskedMobile)),
];
