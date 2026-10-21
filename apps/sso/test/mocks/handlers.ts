import { ClientStatus, LoginPageGuardDecision } from "@iam/contracts";
import { HttpResponse, http } from "msw";
import { authenticationConfig, currentUserInfo, resetPasswordMaskedMobile } from "./fixtures";

function ok<T>(data: T) {
  return HttpResponse.json({ code: 200, message: "OK", data });
}

export const handlers = [
  http.get("*/sso/login-guard", () => ok({ decision: LoginPageGuardDecision.Login })),
  http.get("*/sso/.well-known/authentication-configuration", () => ok(authenticationConfig)),
  http.get("*/public/user-info", () => ok(currentUserInfo)),
  http.post("*/public/delegations/search", () => ok([])),
  http.post("*/open/code/send", () => ok(null)),
  http.get("*/open/client/status", () =>
    ok({
      clientCode: "iam-admin",
      clientName: "IAM 管理后台",
      status: ClientStatus.Enable,
      url: null,
    }),
  ),
  http.get("*/open/users/:username/masked-mobile", () => ok(resetPasswordMaskedMobile)),
];
