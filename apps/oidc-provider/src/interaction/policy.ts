import type { UnknownObject } from "oidc-provider";
import type { GlobalSessionResolver } from "./global-session.ts";
import { errors, interactionPolicy } from "oidc-provider";
import { requestNeedsReauthentication } from "./global-session.ts";

export type AuthorizationRequestClient = {
  redirectUris?: string[];
  allowed_scopes?: unknown;
};

export function validateAuthorizationRequest(params: UnknownObject, client: AuthorizationRequestClient | undefined) {
  if (typeof params.state !== "string" || !params.state)
    throw new errors.InvalidRequest("state is required");
  if (typeof params.code_challenge !== "string" || !params.code_challenge)
    throw new errors.InvalidRequest("code_challenge is required");
  if (params.code_challenge_method !== "S256")
    throw new errors.InvalidRequest("code_challenge_method must be S256");
  if (!client)
    throw new errors.InvalidRequest("client is required");
  if (typeof params.redirect_uri !== "string" || !client.redirectUris?.includes(params.redirect_uri))
    throw new errors.InvalidRequest("redirect_uri must exactly match a registered URI");
  const requestedScopes = typeof params.scope === "string" ? params.scope.split(" ").filter(Boolean) : [];
  const allowedScopes = client.allowed_scopes;
  if (!Array.isArray(allowedScopes)
    || !requestedScopes.includes("openid")
    || requestedScopes.some(scope => !allowedScopes.includes(scope))) {
    throw new errors.InvalidScope("requested scopes are not allowed for this client", requestedScopes.join(" "));
  }
}

export function createIamInteractionPolicy(globalSessions: GlobalSessionResolver) {
  const policy = interactionPolicy.base();
  policy.remove("consent");
  const login = policy.get("login");
  if (!login)
    throw new Error("oidc-provider login interaction policy is unavailable");
  login.checks.clear();
  login.checks.add(new interactionPolicy.Check(
    "iam_global_session",
    "IAM global authentication is required",
    "login_required",
    async (ctx) => {
      const params = ctx.oidc.params ?? {};
      const client = ctx.oidc.client;
      validateAuthorizationRequest(params, client);

      const session = await globalSessions.resolve(ctx.req);
      ctx.state.iamGlobalSession = session;
      const providerSession = ctx.oidc.session;
      if (!session || !providerSession?.accountId)
        return interactionPolicy.Check.REQUEST_PROMPT;
      if (providerSession.accountId !== session.accountId)
        return interactionPolicy.Check.REQUEST_PROMPT;
      return requestNeedsReauthentication(params, session.authTime)
        ? interactionPolicy.Check.REQUEST_PROMPT
        : interactionPolicy.Check.NO_NEED_TO_PROMPT;
    },
  ));
  return policy;
}
