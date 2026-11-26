import { exposeImageCaptchaTicket } from "@auth-api/middlewares/image-captcha-response";
import { getApiAuditRequestContext } from "@auth-api/services/audit/audit.context";
import type { LoginCredentialParser } from "@auth-api/services/authentication/login-credential.parser";
import type { LoginWithMobileUseCase } from "@auth-api/use-cases/authentication/login-with-mobile/login-with-mobile.use-case";
import type { LoginWithPasswordUseCase } from "@auth-api/use-cases/authentication/login-with-password/login-with-password.use-case";
import * as resp from "@iam/api-core/http";
import { IMAGE_CAPTCHA_PROOF_HEADER } from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";
import { setCookie } from "hono/cookie";
import type { AuthRouteHandler } from "./auth.type";

export interface CreateAuthHandlersDeps {
  authentication: {
    loginWithMobile: Pick<LoginWithMobileUseCase, "execute">;
    loginWithPassword: Pick<LoginWithPasswordUseCase, "execute">;
  };
  loginCredentialParser: Pick<LoginCredentialParser, "parseLoginPasswordCredential">;
  config: {
    userSessionTtlSeconds: number;
  };
}

export function createRootAuthHandlers(deps: CreateAuthHandlersDeps) {
  const loginPassword: AuthRouteHandler<"loginPassword"> = async (c) => {
    const { credential, capToken } = c.req.valid("json");
    const { username, password } = await deps.loginCredentialParser.parseLoginPasswordCredential(credential);
    const requestContext = getApiAuditRequestContext(c);
    const imageCaptchaProof = c.req.header(IMAGE_CAPTCHA_PROOF_HEADER);
    const data = await deps.authentication.loginWithPassword
      .execute({ capToken, password, username, ...(imageCaptchaProof && { imageCaptchaProof }) }, { requestContext })
      .catch((error: unknown) => exposeImageCaptchaTicket(c, error));
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: data.remainingSeconds ?? deps.config.userSessionTtlSeconds,
      path: "/",
    });
    return c.json(resp.ok({ token: data.token, isMobileSet: data.isMobileSet }), HttpStatusCodes.OK);
  };

  const loginMobile: AuthRouteHandler<"loginMobile"> = async (c) => {
    const { code, phoneNumber, capToken } = c.req.valid("json");
    const requestContext = getApiAuditRequestContext(c);
    const imageCaptchaProof = c.req.header(IMAGE_CAPTCHA_PROOF_HEADER);
    const data = await deps.authentication.loginWithMobile
      .execute({ capToken, code, phoneNumber, ...(imageCaptchaProof && { imageCaptchaProof }) }, { requestContext })
      .catch((error: unknown) => exposeImageCaptchaTicket(c, error));
    setCookie(c, "global_session", data.token, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: data.remainingSeconds ?? deps.config.userSessionTtlSeconds,
      path: "/",
    });
    return c.json(resp.ok({ token: data.token, isMobileSet: data.isMobileSet }), HttpStatusCodes.OK);
  };

  return { loginMobile, loginPassword };
}
