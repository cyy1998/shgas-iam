import type { UnknownObject } from "oidc-provider";
import type {
  InteractionGlobalSessionResolver,
  InteractionProviderSessionPrincipalReader,
  InteractionTrafficGate,
} from "./interaction.port.ts";
import { OidcScope } from "@iam/contracts";
import { errors, interactionPolicy } from "oidc-provider";
import { normalizeOidcProtocolScopes } from "../protocol/scopes.ts";
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
  const requestedScopes = normalizeOidcProtocolScopes({ scope: params.scope });
  const allowedScopes = client.allowed_scopes;
  if (!requestedScopes
    || !Array.isArray(allowedScopes)
    || !requestedScopes.includes(OidcScope.OpenId)
    || requestedScopes.some(scope => !allowedScopes.includes(scope))) {
    throw new errors.InvalidScope(
      "requested scopes are not allowed for this client",
      requestedScopes?.join(" ") ?? "",
    );
  }
}

export function createIamInteractionPolicy(
  globalSessions: InteractionGlobalSessionResolver,
  providerSessions: InteractionProviderSessionPrincipalReader,
  trafficGate: InteractionTrafficGate,
) {
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
      const clientId = typeof params.client_id === "string" ? params.client_id : null;
      if (!clientId)
        throw new errors.InvalidRequest("client is required");
      await trafficGate.assertIssuanceAllowed(clientId);

      const session = await globalSessions.resolve(ctx.req);
      ctx.state.iamGlobalSession = session;
      const providerSession = ctx.oidc.session;
      if (!session || !providerSession?.accountId)
        return interactionPolicy.Check.REQUEST_PROMPT;
      if (providerSession.accountId !== session.accountId)
        return interactionPolicy.Check.REQUEST_PROMPT;
      const authorizationAttemptId = ctx.oidc.entities.Interaction?.uid ?? null;
      if (!providerSession.uid
        || !clientId
        || !await providerSessions.isCurrentOrStagedPrincipal(
          providerSession.uid,
          clientId,
          session,
          authorizationAttemptId,
        )) {
        return interactionPolicy.Check.REQUEST_PROMPT;
      }
      if (!requestNeedsReauthentication(params, session.authTime))
        return interactionPolicy.Check.NO_NEED_TO_PROMPT;
      const completedFirstAuthentication = authorizationAttemptId
        ? await providerSessions.isStagedPrincipal(
            authorizationAttemptId,
            clientId,
            session,
          )
        : false;
      return !completedFirstAuthentication
        ? interactionPolicy.Check.REQUEST_PROMPT
        : interactionPolicy.Check.NO_NEED_TO_PROMPT;
    },
  ));
  return policy;
}
