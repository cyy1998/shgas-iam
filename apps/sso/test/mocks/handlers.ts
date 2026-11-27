import { ClientStatus, LoginPageGuardDecision } from "@iam/contracts";
import { http } from "msw";
import { ok } from "./auth";
import { authenticationConfig, currentUserInfo, resetPasswordMaskedMobile } from "./fixtures";

export const handlers = [
  http.get("*/sso/login-guard", () => ok({ decision: LoginPageGuardDecision.Login })),
  http.get("*/sso/.well-known/authentication-configuration", () => ok(authenticationConfig)),
  http.get("*/api/iam/sso/user-info", () => ok(currentUserInfo)),
  http.post("*/api/iam/delegations/search", () => ok([])),
  http.post("*/api/iam/auth/sms/send", () => ok(null)),
  http.post("*/api/iam/auth/sms/verify", () => ok({ result: true })),
  http.post("*/api/iam/auth/recovery/password-reset", () => ok(null)),
  http.post("*/api/iam/auth/login/password", () => ok({ isMobileSet: true })),
  http.post("*/api/iam/auth/account/mobile", () => ok(null)),
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
