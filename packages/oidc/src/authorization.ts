import type { ClientSnapshotReader } from "@iam/api-core/client-snapshot";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { UnifiedSessionKernel, UserSessionObservation } from "@iam/session-kernel";
import type { AcceptedAuthorization, OidcContinuation, OidcStateRedis } from "./state";
import type { OidcAuthorizationResponse } from "./wire";
import { requireSubjectAccessOperation, SubjectAccessDisabledError } from "@iam/api-core/subject-access";
import {
  ClientCodeSchema,
  ClientSsoProtocol,
  ClientStatus,
  getClientSsoTokenEndpointAuthMethod,
  OIDC_SUPPORTED_SCOPES,
} from "@iam/contracts";
import { z } from "zod";
import { OidcProtocolError } from "./errors";
import { createOidcState, digest, randomHandle } from "./state";
import { OidcResponseModeSchema } from "./wire";

export interface OidcAuthorizationOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  redis: OidcStateRedis;
  namespace: string;
  codeTtlSeconds: number;
  continuationTtlSeconds: number;
}
export interface OidcBrowserInput {
  globalSessionToken?: string;
  browserBinding?: string;
  completion?: string;
}
export type OidcAuthorizationResult
  = | { kind: "response"; response: OidcAuthorizationResponse; clearGlobalSessionCookie?: boolean }
    | { kind: "login"; handle: string; browserBinding: string; ttl: number; clearGlobalSessionCookie: boolean };

function invalid(description: string): never {
  throw new OidcProtocolError("invalid_request", description);
}

export function createOidcAuthorization(options: OidcAuthorizationOptions) {
  const codeTtl = z.number().int().positive().parse(options.codeTtlSeconds);
  const continuationTtl = z.number().int().positive().parse(options.continuationTtlSeconds);
  const state = createOidcState(options.redis, options.namespace);
  return {
    forOperation(operation: SubjectAccessOperation) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function client(clientId: string) {
        const snapshot = await options.clients.acquire(clientId);
        if (snapshot.kind !== "present" || snapshot.value.clientCode !== clientId)
          throw new OidcProtocolError("invalid_client", "Unknown client");
        if (snapshot.value.status === ClientStatus.Maintenance)
          throw new OidcProtocolError("temporarily_unavailable", "Client is under maintenance", 503);
        if (
          snapshot.value.status !== ClientStatus.Enable
          || !snapshot.value.ssoEnabled
          || snapshot.value.ssoConfig?.protocol !== ClientSsoProtocol.Oidc
        ) {
          throw new OidcProtocolError("unauthorized_client", "Client is not enabled for OIDC");
        }
        return snapshot.value.ssoConfig;
      }
      async function accept(parameters: URLSearchParams): Promise<AcceptedAuthorization> {
        // Only known parameters participate. Disabled claims/resource and arbitrary extensions stay ignored.
        const known = [
          "client_id",
          "redirect_uri",
          "response_type",
          "response_mode",
          "scope",
          "state",
          "nonce",
          "code_challenge",
          "code_challenge_method",
          "prompt",
          "max_age",
          "request",
          "request_uri",
          "registration",
        ];
        for (const key of known) {
          if (parameters.getAll(key).length > 1)
            invalid(`Duplicate parameter: ${key}`);
        }
        const clientId = parameters.get("client_id");
        if (!clientId || !ClientCodeSchema.safeParse(clientId).success)
          invalid("client_id is required");
        const config = await client(clientId);
        const redirectUri = parameters.get("redirect_uri");
        if (!redirectUri || !config.redirectUris.includes(redirectUri))
          invalid("redirect_uri must exactly match a registered URI");
        const responseMode = OidcResponseModeSchema.safeParse(parameters.get("response_mode") ?? "query");
        const stateValue = parameters.get("state") ?? undefined;
        function reject(error: string, description: string): never {
          throw new OidcProtocolError(error, description, 400, {
            redirectUri: redirectUri!,
            responseMode: responseMode.success ? responseMode.data : "query",
            parameters: {
              error,
              error_description: description,
              ...(stateValue ? { state: stateValue } : {}),
            },
          });
        }
        if (!responseMode.success)
          reject("unsupported_response_mode", "Unsupported response_mode");
        for (const key of ["request", "request_uri", "registration"]) {
          if (parameters.has(key))
            reject(`${key}_not_supported`, `${key} is not supported`);
        }
        if (parameters.get("response_type") !== "code")
          reject("unsupported_response_type", "Only response_type=code is supported");
        if (!stateValue?.trim())
          reject("invalid_request", "A non-empty state is required");
        const scopes = [...new Set((parameters.get("scope") ?? "").split(" ").filter(Boolean))].filter(
          scope => scope !== "offline_access",
        );
        const allowedScopes = new Set<string>(config.allowedScopes);
        if (!scopes.includes("openid") || scopes.some(scope => !allowedScopes.has(scope)))
          reject("invalid_scope", "Requested scope is not allowed");
        const challenge = parameters.get("code_challenge") ?? "";
        if (parameters.get("code_challenge_method") !== "S256" || !/^[\w.~-]{43,128}$/u.test(challenge))
          reject("invalid_request", "S256 PKCE is required");
        const prompts = [...new Set((parameters.get("prompt") ?? "").split(" ").filter(Boolean))];
        if (
          prompts.some(prompt => prompt !== "none" && prompt !== "login")
          || (prompts.includes("none") && prompts.length > 1)
        ) {
          reject("invalid_request", "Unsupported prompt combination");
        }
        const rawMaxAge = parameters.get("max_age");
        const maxAge = rawMaxAge === null ? undefined : Number(rawMaxAge);
        if (maxAge !== undefined && (!Number.isSafeInteger(maxAge) || maxAge < 0))
          reject("invalid_request", "max_age must be a non-negative integer");
        return {
          clientId,
          redirectUri,
          scope: scopes.join(" "),
          state: stateValue,
          responseMode: responseMode.data,
          codeChallenge: challenge,
          codeChallengeMethod: "S256",
          prompt: prompts.join(" "),
          ...(parameters.has("nonce") ? { nonce: parameters.get("nonce")! } : {}),
          ...(maxAge === undefined ? {} : { maxAge }),
        };
      }
      async function root(token?: string) {
        if (!token)
          return null;
        const result = await sessions.resolveUserSession(token);
        if (result.status === "corrupt")
          throw new OidcProtocolError("temporarily_unavailable", "Session state unavailable", 503);
        if (result.status !== "resolved")
          return null;
        const user = result.value.userSession;
        try {
          await operation.acquireForSession({
            principalSessionId: user.userSessionId,
            subjectIdentifier: user.subjectIdentifier,
            subjectContext: user.subjectContext,
          });
        }
        catch (error) {
          if (error instanceof SubjectAccessDisabledError)
            return null;
          throw error;
        }
        return result.value;
      }
      function needsReauthentication(accepted: AcceptedAuthorization, observed: UserSessionObservation) {
        return (
          accepted.prompt.split(" ").includes("login")
          || accepted.maxAge === 0
          || (accepted.maxAge !== undefined
            && observed.observedAt - observed.userSession.authTime > accepted.maxAge * 1000)
        );
      }
      function loginRequired(
        accepted: AcceptedAuthorization,
        clearGlobalSessionCookie = false,
      ): OidcAuthorizationResult {
        return {
          kind: "response",
          clearGlobalSessionCookie,
          response: {
            redirectUri: accepted.redirectUri,
            responseMode: accepted.responseMode,
            parameters: {
              error: "login_required",
              error_description: "Fresh authentication is required",
              state: accepted.state,
            },
          },
        };
      }
      async function issue(
        accepted: AcceptedAuthorization,
        parent: UserSessionObservation,
      ): Promise<OidcAuthorizationResult> {
        const opened = await sessions.openClientSession(parent, {
          clientId: accepted.clientId,
          protocol: "oidc",
        });
        if (opened.status !== "created" && opened.status !== "reused") {
          if (opened.status === "expired" || opened.status === "missing" || opened.status === "terminated")
            return loginRequired(accepted);
          const error = "temporarily_unavailable";
          const description = "Client session state unavailable";
          throw new OidcProtocolError(error, description, 503, {
            redirectUri: accepted.redirectUri,
            responseMode: accepted.responseMode,
            parameters: { error, error_description: description, state: accepted.state },
          });
        }
        const lifetime = await sessions.getIssuanceLifetime(opened.value, codeTtl);
        if (lifetime.remainingSeconds <= 0)
          return loginRequired(accepted);
        const { userSession, clientSession } = opened.value;
        const codeId = randomHandle();
        await state.saveCode({
          ...accepted,
          version: 1,
          protocol: "oidc",
          codeId,
          userSessionId: userSession.userSessionId,
          clientSessionId: clientSession.clientSessionId,
          userSessionInstance: userSession.instance,
          clientSessionInstance: clientSession.instance,
          issuedAt: lifetime.issuedAt,
          expiresAt: lifetime.expiresAt,
        });
        return {
          kind: "response",
          response: {
            redirectUri: accepted.redirectUri,
            responseMode: accepted.responseMode,
            parameters: {
              code: `${codeId}.${userSession.userSessionId}.${clientSession.clientSessionId}`,
              state: accepted.state,
            },
          },
        };
      }
      async function continuation(handle: string, browser: OidcBrowserInput): Promise<OidcContinuation> {
        const saved = await state.readContinuation(handle, browser.browserBinding ?? "");
        if (!saved)
          invalid("Login request is invalid or expired");
        await client(saved.authorization.clientId);
        return saved;
      }
      return {
        async authorize(
          parameters: URLSearchParams,
          browser: OidcBrowserInput,
        ): Promise<OidcAuthorizationResult> {
          const accepted = await accept(parameters);
          const parent = await root(browser.globalSessionToken);
          if (parent) {
            return needsReauthentication(accepted, parent)
              ? loginRequired(accepted)
              : await issue(accepted, parent);
          }
          if (accepted.prompt.split(" ").includes("none"))
            return loginRequired(accepted, Boolean(browser.globalSessionToken));
          const browserBinding = browser.browserBinding || randomHandle();
          const handle = await state.saveContinuation(
            { authorization: accepted, completionDigest: null },
            browserBinding,
            continuationTtl,
          );
          return {
            kind: "login",
            handle,
            browserBinding,
            ttl: continuationTtl,
            clearGlobalSessionCookie: Boolean(browser.globalSessionToken),
          };
        },
        async checkLoginContinuation(handle: string, browser: OidcBrowserInput) {
          await continuation(handle, browser);
          const parent = await root(browser.globalSessionToken);
          if (parent) {
            return { decision: "continue" as const, clearGlobalSessionCookie: false };
          }
          const completion = randomHandle();
          if (!(await state.allowCompletion(handle, browser.browserBinding!, completion)))
            invalid("Login request is invalid or expired");
          return {
            decision: "login" as const,
            clearGlobalSessionCookie: Boolean(browser.globalSessionToken),
            completion,
            ttl: continuationTtl,
          };
        },
        async resume(handle: string, browser: OidcBrowserInput): Promise<OidcAuthorizationResult> {
          const saved = await continuation(handle, browser);
          const parent = await root(browser.globalSessionToken);
          if (!parent) {
            throw new OidcProtocolError(
              "login_required",
              "No valid session",
              400,
              undefined,
              Boolean(browser.globalSessionToken),
            );
          }
          const firstCompletion
            = saved.completionDigest !== null && saved.completionDigest === digest(browser.completion ?? "");
          if (needsReauthentication(saved.authorization, parent) && !firstCompletion)
            return loginRequired(saved.authorization);
          if (!(await state.consumeContinuation(handle, browser.browserBinding!)))
            invalid("Login request has already been used");
          return await issue(saved.authorization, parent);
        },
        async clientMetadata(clientId: string) {
          const config = await client(clientId);
          return {
            client_id: clientId,
            token_endpoint_auth_method: getClientSsoTokenEndpointAuthMethod(config),
            redirect_uris: [...config.redirectUris],
            scope: config.allowedScopes.join(" "),
          };
        },
      };
    },
    discovery(issuer: string) {
      return {
        issuer,
        authorization_endpoint: `${issuer}/auth`,
        response_types_supported: ["code"],
        response_modes_supported: ["query", "fragment", "form_post"],
        scopes_supported: [...OIDC_SUPPORTED_SCOPES],
        code_challenge_methods_supported: ["S256"],
        subject_types_supported: ["public"],
        claims_parameter_supported: false,
        request_parameter_supported: false,
        request_uri_parameter_supported: false,
      };
    },
  };
}
export type OidcAuthorization = ReturnType<typeof createOidcAuthorization>;
