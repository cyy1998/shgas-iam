import type { ClientSnapshotReader } from "@iam/api-core/client-snapshot";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { RevocationResult, UnifiedSessionKernel } from "@iam/session-kernel";
import type { OidcHintVerificationPort } from "./signing";
import type { OidcStateRedis } from "./state";
import { requireSubjectAccessOperation } from "@iam/api-core/subject-access";
import { ClientCodeSchema, ClientSsoProtocol } from "@iam/contracts";
import { z } from "zod";
import { OidcProtocolError } from "./errors";
import { createOidcLogoutState } from "./logout-state";
import { digest, randomHandle } from "./state";

export interface OidcLogoutOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  redis: OidcStateRedis;
  namespace: string;
  issuer: string;
  verification: OidcHintVerificationPort;
  confirmationTtlSeconds: number;
}
export interface OidcLogoutBrowser {
  globalSessionToken?: string;
  binding?: string;
  handle?: string;
}
export interface OidcLogoutEffect {
  choice: "confirm" | "cancel";
  revocation: RevocationResult | null;
}
export class OidcLogoutFailure extends Error {
  constructor(readonly revocation: RevocationResult) {
    super("OIDC logout could not be confirmed");
  }
}
function invalid(description: string): never {
  throw new OidcProtocolError("invalid_request", description);
}

export function createOidcLogout(options: OidcLogoutOptions) {
  const ttl = z.number().int().positive().parse(options.confirmationTtlSeconds);
  const store = createOidcLogoutState(options.redis, options.namespace);
  return {
    forOperation(operation: SubjectAccessOperation) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function client(clientId: string) {
        if (!ClientCodeSchema.safeParse(clientId).success)
          invalid("Invalid client_id");
        const result = await options.clients.acquire(clientId);
        if (result.kind !== "present" || result.value.clientCode !== clientId)
          throw new OidcProtocolError("invalid_client", "Unknown client");
        // Logout remains available during Maintenance and SSO disablement.
        if (result.value.ssoConfig?.protocol !== ClientSsoProtocol.Oidc)
          throw new OidcProtocolError("invalid_client", "Client is not configured for OIDC");
        return result.value.ssoConfig;
      }
      async function root(token?: string) {
        if (!token)
          return null;
        const result = await sessions.resolveUserSession(token);
        if (result.status === "corrupt")
          throw new OidcProtocolError("temporarily_unavailable", "Session state unavailable", 503);
        return result.status === "resolved" ? result.value : null;
      }
      return {
        async begin(parameters: URLSearchParams, browser: OidcLogoutBrowser) {
          for (const key of [
            "id_token_hint",
            "client_id",
            "post_logout_redirect_uri",
            "state",
            "ui_locales",
            "logout_hint",
          ]) {
            if (parameters.getAll(key).length > 1)
              invalid(`Duplicate parameter: ${key}`);
          }
          const token = parameters.get("id_token_hint");
          const redirectUri = parameters.get("post_logout_redirect_uri");
          if (redirectUri !== null && !token)
            invalid("id_token_hint is required for post_logout_redirect_uri");
          let clientId = parameters.get("client_id");
          let hint = null;
          if (token) {
            let claims;
            try {
              claims = await options.verification.verifyLogoutHint(token, options.issuer);
            }
            catch {
              invalid("Invalid id_token_hint");
            }
            if (clientId !== null && clientId !== claims.clientId)
              invalid("client_id does not match id_token_hint");
            clientId = claims.clientId;
            hint = { digest: digest(token), subjectIdentifier: claims.subjectIdentifier };
          }
          const config = clientId !== null ? await client(clientId) : null;
          if (redirectUri !== null && !config?.postLogoutRedirectUris.includes(redirectUri))
            invalid("post_logout_redirect_uri must exactly match a registered URI");
          const observed = await root(browser.globalSessionToken);
          const binding = randomHandle();
          const saved = await store.save(
            { clientId, hint, redirectUri, state: parameters.get("state") },
            binding,
            ttl,
          );
          return {
            ...saved,
            binding,
            ttl,
            redirectUri,
            autoSubmit: !observed,
            clearGlobalSessionCookie: Boolean(browser.globalSessionToken) && !observed,
          };
        },
        async confirm(parameters: URLSearchParams, browser: OidcLogoutBrowser) {
          for (const key of ["xsrf", "logout"]) {
            if (parameters.getAll(key).length > 1)
              invalid(`Duplicate parameter: ${key}`);
          }
          const saved = await store.read(
            browser.handle ?? "",
            browser.binding ?? "",
            parameters.get("xsrf") ?? "",
          );
          if (!saved)
            invalid("Logout request is invalid or expired");
          const confirmed = Boolean(parameters.get("logout"));
          if (confirmed && saved.value.clientId)
            await client(saved.value.clientId);
          // The request's current root is the target; confirmation never fixes a previous root.
          const observed = confirmed ? await root(browser.globalSessionToken) : null;
          if (!(await store.consume(browser.handle!, saved.raw)))
            invalid("Logout request has already been used");
          const revocation = observed ? await sessions.revokeObservedUserSession(observed) : null;
          if (
            revocation
            && !["terminated", "already_terminated", "missing", "expired"].includes(revocation.status)
          ) {
            throw new OidcLogoutFailure(revocation);
          }
          const effect: OidcLogoutEffect = { choice: confirmed ? "confirm" : "cancel", revocation };
          const target = new URL(saved.value.redirectUri ?? `${options.issuer}/session/end/success`);
          if (saved.value.redirectUri && saved.value.state !== null)
            target.searchParams.set("state", saved.value.state);
          return { redirectUri: target.href, clearGlobalSessionCookie: confirmed, effect };
        },
      };
    },
    discovery: () => ({ end_session_endpoint: `${options.issuer}/session/end` }),
  };
}
export type OidcLogout = ReturnType<typeof createOidcLogout>;
