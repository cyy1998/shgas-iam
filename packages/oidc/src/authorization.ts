import type { ClientSnapshotReader, ClientSnapshotValue } from "@iam/client-snapshot";
import type { ApplicationAdmissionInput, ApplicationAdmissionResult } from "@iam/contracts";
import {
  buildApplicationAccessDeniedPath,
  ClientCodeSchema,
  ClientSsoProtocol,
  ClientStatus,
  getClientSsoTokenEndpointAuthMethod,
  OIDC_SUPPORTED_SCOPES,
} from "@iam/contracts";
import type { UnifiedSessionKernel, UserSessionObservation } from "@iam/session-kernel";
import type { SubjectAccessOperation } from "@iam/subject-access";
import { requireSubjectAccessOperation, SubjectAccessDisabledError } from "@iam/subject-access";
import { z } from "zod";
import { OidcProtocolError } from "./errors";
import type { AcceptedAuthorization, OidcStateRedis } from "./state";
import { createOidcState, digest, randomHandle } from "./state";
import type { OidcAuthorizationResponse } from "./wire";
import { OidcResponseModeSchema } from "./wire";

export interface OidcAuthorizationOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  redis: OidcStateRedis;
  namespace: string;
  codeTtlSeconds: number;
  continuationTtlSeconds: number;
  admission: {
    evaluate(input: ApplicationAdmissionInput): Promise<ApplicationAdmissionResult>;
  };
}
export interface OidcBrowserInput {
  globalSessionToken?: string;
  browserBinding?: string;
  completion?: string;
}
export type OidcAuthorizationResult =
  | { kind: "response"; response: OidcAuthorizationResponse; clearGlobalSessionCookie?: boolean }
  | { kind: "denied"; clientCode: string; response: OidcAuthorizationResponse }
  | { kind: "login"; handle: string; browserBinding: string; ttl: number; clearGlobalSessionCookie: boolean };

type AdmissionPolicy = Pick<ClientSnapshotValue, "admissionEnabled" | "admissionFilter">;

function invalid(description: string): never {
  throw new OidcProtocolError("invalid_request", description);
}

export function createOidcAuthorization(options: OidcAuthorizationOptions) {
  const codeTtl = z.number().int().positive().parse(options.codeTtlSeconds);
  const continuationTtl = z.number().int().positive().parse(options.continuationTtlSeconds);
  const state = createOidcState(options.redis, options.namespace);
  return {
    forOperation(operation: SubjectAccessOperation, issuer: string) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function client(clientId: string) {
        const snapshot = await options.clients.acquire(clientId);
        if (snapshot.kind !== "present" || snapshot.value.clientCode !== clientId)
          throw new OidcProtocolError("invalid_client", "Unknown client");
        if (snapshot.value.status === ClientStatus.Maintenance)
          throw new OidcProtocolError("temporarily_unavailable", "Client is under maintenance", 503);
        if (
          snapshot.value.status !== ClientStatus.Enable ||
          !snapshot.value.ssoEnabled ||
          snapshot.value.ssoConfig?.protocol !== ClientSsoProtocol.Oidc
        ) {
          throw new OidcProtocolError("unauthorized_client", "Client is not enabled for OIDC");
        }
        const { ssoConfig, admissionEnabled, admissionFilter } = snapshot.value;
        return { ssoConfig, admissionEnabled, admissionFilter };
      }
      async function accept(parameters: URLSearchParams) {
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
          if (parameters.getAll(key).length > 1) invalid(`Duplicate parameter: ${key}`);
        }
        const clientId = parameters.get("client_id");
        if (!clientId || !ClientCodeSchema.safeParse(clientId).success) invalid("client_id is required");
        const observedClient = await client(clientId);
        const config = observedClient.ssoConfig;
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
              iss: issuer,
              error,
              error_description: description,
              ...(stateValue ? { state: stateValue } : {}),
            },
          });
        }
        if (!responseMode.success) reject("unsupported_response_mode", "Unsupported response_mode");
        for (const key of ["request", "request_uri", "registration"]) {
          if (parameters.has(key)) reject(`${key}_not_supported`, `${key} is not supported`);
        }
        if (parameters.get("response_type") !== "code")
          reject("unsupported_response_type", "Only response_type=code is supported");
        if (!stateValue?.trim()) reject("invalid_request", "A non-empty state is required");
        const scopes = [...new Set((parameters.get("scope") ?? "").split(" ").filter(Boolean))].filter(
          (scope) => scope !== "offline_access",
        );
        const allowedScopes = new Set<string>(config.allowedScopes);
        if (!scopes.includes("openid") || scopes.some((scope) => !allowedScopes.has(scope)))
          reject("invalid_scope", "Requested scope is not allowed");
        const challenge = parameters.get("code_challenge") ?? "";
        if (parameters.get("code_challenge_method") !== "S256" || !/^[\w.~-]{43,128}$/u.test(challenge))
          reject("invalid_request", "S256 PKCE is required");
        const prompts = [...new Set((parameters.get("prompt") ?? "").split(" ").filter(Boolean))];
        if (
          prompts.some((prompt) => prompt !== "none" && prompt !== "login") ||
          (prompts.includes("none") && prompts.length > 1)
        ) {
          reject("invalid_request", "Unsupported prompt combination");
        }
        const rawMaxAge = parameters.get("max_age");
        const maxAge = rawMaxAge === null ? undefined : Number(rawMaxAge);
        if (maxAge !== undefined && (!Number.isSafeInteger(maxAge) || maxAge < 0))
          reject("invalid_request", "max_age must be a non-negative integer");
        const accepted: AcceptedAuthorization = {
          issuer,
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
        return { accepted, observedClient };
      }
      async function root(token?: string) {
        if (!token) return null;
        const result = await sessions.resolveUserSession(token);
        if (result.status === "corrupt")
          throw new OidcProtocolError("temporarily_unavailable", "Session state unavailable", 503);
        if (result.status !== "resolved") return null;
        const user = result.value.userSession;
        try {
          await operation.acquireForSession({
            principalSessionId: user.userSessionId,
            subjectIdentifier: user.subjectIdentifier,
            subjectContext: user.subjectContext,
          });
        } catch (error) {
          if (error instanceof SubjectAccessDisabledError) return null;
          throw error;
        }
        return result.value;
      }
      function needsReauthentication(accepted: AcceptedAuthorization, observed: UserSessionObservation) {
        return (
          accepted.prompt.split(" ").includes("login") ||
          accepted.maxAge === 0 ||
          (accepted.maxAge !== undefined &&
            observed.observedAt - observed.userSession.authTime > accepted.maxAge * 1000)
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
              iss: accepted.issuer,
              error: "login_required",
              error_description: "Fresh authentication is required",
              state: accepted.state,
            },
          },
        };
      }
      async function checkAdmission(
        accepted: AcceptedAuthorization,
        parent: UserSessionObservation,
        policy: AdmissionPolicy,
      ): Promise<OidcAuthorizationResult | undefined> {
        if (!policy.admissionEnabled) return;
        const outcome = await options.admission.evaluate({
          clientCode: accepted.clientId,
          subjectIdentifier: parent.userSession.subjectIdentifier,
          filter: policy.admissionFilter,
        });
        if (outcome === "match") return;
        const response = {
          redirectUri: accepted.redirectUri,
          responseMode: accepted.responseMode,
        };
        const context = { iss: accepted.issuer, state: accepted.state };
        if (outcome === "no-match") {
          return {
            kind: "denied",
            clientCode: accepted.clientId,
            response: {
              ...response,
              parameters: {
                ...context,
                error: "access_denied",
                error_description: "Application access denied",
                ...(accepted.prompt === "none"
                  ? {}
                  : { error_uri: new URL(buildApplicationAccessDeniedPath(accepted.clientId), accepted.issuer).href }),
              },
            },
          };
        }
        const error = "temporarily_unavailable";
        const description = "Application admission unavailable";
        throw new OidcProtocolError(error, description, 503, {
          ...response,
          parameters: { ...context, error, error_description: description },
        });
      }
      async function completeAuthorization(
        accepted: AcceptedAuthorization,
        parent: UserSessionObservation,
        policy: AdmissionPolicy,
        resume?: { handle: string; browserBinding: string },
      ): Promise<OidcAuthorizationResult> {
        const denied = await checkAdmission(accepted, parent, policy);
        // Keep the continuation available after a transient admission failure.
        // A definitive outcome must still win the existing one-time consumption.
        if (resume && !(await state.consumeContinuation(resume.handle, resume.browserBinding)))
          invalid("Login request has already been used");
        if (denied) return denied;

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
            parameters: { iss: accepted.issuer, error, error_description: description, state: accepted.state },
          });
        }
        const lifetime = await sessions.getIssuanceLifetime(opened.value, codeTtl);
        if (lifetime.remainingSeconds <= 0) return loginRequired(accepted);
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
              iss: accepted.issuer,
              code: `${codeId}.${userSession.userSessionId}.${clientSession.clientSessionId}`,
              state: accepted.state,
            },
          },
        };
      }
      async function continuation(handle: string, browser: OidcBrowserInput) {
        const saved = await state.readContinuation(handle, browser.browserBinding ?? "");
        if (!saved || saved.authorization.issuer !== issuer) invalid("Login request is invalid or expired");
        const observedClient = await client(saved.authorization.clientId);
        return { saved, observedClient };
      }
      return {
        async authorize(parameters: URLSearchParams, browser: OidcBrowserInput): Promise<OidcAuthorizationResult> {
          const { accepted, observedClient } = await accept(parameters);
          const parent = await root(browser.globalSessionToken);
          if (parent) {
            if (needsReauthentication(accepted, parent)) return loginRequired(accepted);
            return await completeAuthorization(accepted, parent, observedClient);
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
          const { saved, observedClient } = await continuation(handle, browser);
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
          const firstCompletion =
            saved.completionDigest !== null && saved.completionDigest === digest(browser.completion ?? "");
          if (needsReauthentication(saved.authorization, parent) && !firstCompletion)
            return loginRequired(saved.authorization);
          return await completeAuthorization(saved.authorization, parent, observedClient, {
            handle,
            browserBinding: browser.browserBinding ?? "",
          });
        },
        async clientMetadata(clientId: string) {
          const { ssoConfig: config } = await client(clientId);
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
        authorization_response_iss_parameter_supported: true,
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
