import type { IncomingMessage, ServerResponse } from "node:http";
import type Provider from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type {
  InteractionArtifactReader,
  InteractionClientReader,
  InteractionGlobalSessionResolver,
  InteractionProviderSessionBindingStore,
  InteractionReturnHandleStore,
  InteractionTrafficGate,
} from "./interaction.port.ts";
import type { OidcReturnHandlePayload } from "./return-handle.ts";
import { LoginPageGuardDecision } from "@iam/contracts";
import { errors } from "oidc-provider";
import { writeOidcSubjectAccessNodeResponse } from "../provider/subject-access-protocol.ts";
import { getCookieValue, requestNeedsReauthentication } from "./global-session.ts";
import {
  createOpaqueValue,
  secureStringEqual,
} from "./return-handle.ts";

const BROWSER_BINDING_COOKIE = "oidc_interaction_binding";
const LOGIN_COMPLETION_COOKIE = "oidc_login_completion";
const LOGIN_COMPLETION_RETURN_TARGET = "urn:iam:oidc-login-completion";

interface LoginCompletionExpected {
  browserBinding: string;
  clientId: string;
  interactionUid: string;
  oidcConfigVersion: number;
}

function matchesLoginCompletion(
  payload: OidcReturnHandlePayload | null,
  expected: LoginCompletionExpected,
): payload is OidcReturnHandlePayload {
  return payload !== null
    && payload.interactionUid === expected.interactionUid
    && payload.clientId === expected.clientId
    && payload.oidcConfigVersion === expected.oidcConfigVersion
    && payload.returnTarget === LOGIN_COMPLETION_RETURN_TARGET
    && secureStringEqual(payload.browserBinding, expected.browserBinding);
}

function redirect(response: ServerResponse, location: string, cookie?: string) {
  response.statusCode = 302;
  response.setHeader("location", location);
  response.setHeader("cache-control", "no-store");
  if (cookie)
    response.setHeader("set-cookie", cookie);
  response.end();
}

function failClosed(response: ServerResponse) {
  response.statusCode = 400;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ error: "invalid_request" }));
}

function writeLoginGuardDecision(
  response: ServerResponse,
  decision: LoginPageGuardDecision,
) {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ decision }));
}

function appendSetCookie(response: ServerResponse, cookie: string) {
  const current = response.getHeader("set-cookie");
  response.setHeader(
    "set-cookie",
    current === undefined
      ? cookie
      : [...(Array.isArray(current) ? current : [String(current)]), cookie],
  );
}

function serializeHttpOnlyCookie(input: {
  expires?: Date;
  maxAge: number;
  name: string;
  path: string;
  secure: boolean;
  value: string;
}) {
  const secureAttribute = input.secure ? "; Secure" : "";
  const expiresAttribute = input.expires
    ? `; Expires=${input.expires.toUTCString()}`
    : "";
  return `${input.name}=${input.value}; Path=${input.path}; HttpOnly; SameSite=Lax; Max-Age=${input.maxAge}${expiresAttribute}${secureAttribute}`;
}

function expireHttpOnlyCookie(
  response: ServerResponse,
  cookieName: string,
  secure: boolean,
  path = "/",
) {
  appendSetCookie(
    response,
    serializeHttpOnlyCookie({
      expires: new Date(0),
      maxAge: 0,
      name: cookieName,
      path,
      secure,
      value: "",
    }),
  );
}

function setLoginCompletionCookie(
  response: ServerResponse,
  value: string,
  maxAge: number,
  secure: boolean,
) {
  appendSetCookie(
    response,
    serializeHttpOnlyCookie({
      maxAge,
      name: LOGIN_COMPLETION_COOKIE,
      path: "/oidc",
      secure,
      value,
    }),
  );
}

function expireLoginCompletionCookie(response: ServerResponse, secure: boolean) {
  expireHttpOnlyCookie(
    response,
    LOGIN_COMPLETION_COOKIE,
    secure,
    "/oidc",
  );
}

export interface CreateOidcInteractionHandlerDeps {
  provider: Provider;
  interactionArtifacts: InteractionArtifactReader;
  clients: InteractionClientReader;
  globalSessions: InteractionGlobalSessionResolver;
  providerSessions: InteractionProviderSessionBindingStore;
  returnHandles: InteractionReturnHandleStore;
  trafficGate: InteractionTrafficGate;
  env: OidcProviderEnv;
}

export function createOidcInteractionHandler(deps: CreateOidcInteractionHandlerDeps) {
  async function resolveLoginCompletion(
    request: IncomingMessage,
    expected: LoginCompletionExpected,
  ) {
    const handle = getCookieValue(request.headers.cookie, LOGIN_COMPLETION_COOKIE);
    if (!handle)
      return null;
    const payload = await deps.returnHandles.resolveReturnHandle(handle);
    if (!matchesLoginCompletion(payload, expected)) {
      return null;
    }
    return { handle, payload };
  }

  async function handleInteraction(request: IncomingMessage, response: ServerResponse) {
    const details = await deps.provider.interactionDetails(request, response);
    const clientId = typeof details.params.client_id === "string" ? details.params.client_id : null;
    if (!clientId || details.prompt.name !== "login")
      return failClosed(response);
    await deps.trafficGate.assertIssuanceAllowed(clientId);
    const client = await deps.clients.findRuntime(clientId);
    if (!client)
      return failClosed(response);

    const session = await deps.globalSessions.resolve(request);
    const needsReauthentication = session
      ? requestNeedsReauthentication(details.params, session.authTime)
      : false;
    const stagedFirstAuthentication = session && needsReauthentication
      ? await deps.providerSessions.isStagedPrincipal(details.uid, clientId, session)
      : false;
    const existingBrowserBinding = getCookieValue(
      request.headers.cookie,
      BROWSER_BINDING_COOKIE,
    );
    const loginCompletion = session
      && existingBrowserBinding
      && !stagedFirstAuthentication
      ? await resolveLoginCompletion(request, {
          browserBinding: existingBrowserBinding,
          clientId,
          interactionUid: details.uid,
          oidcConfigVersion: client.oidc_config_version,
        })
      : null;
    const completedFirstAuthentication
      = stagedFirstAuthentication || loginCompletion !== null;
    if (session
      && needsReauthentication
      && !completedFirstAuthentication) {
      await deps.provider.interactionFinished(
        request,
        response,
        { error: "login_required" },
        { mergeWithLastSubmission: false },
      );
      return;
    }
    if (session) {
      if (!await deps.globalSessions.renew(session.sessionId))
        return failClosed(response);
      const bindingContext = {
        authorizationAttemptId: details.uid,
        clientId,
        oidcConfigVersion: client.oidc_config_version,
        providerSessionUid: details.session?.uid ?? null,
      };
      if (!await deps.providerSessions.stage(session, bindingContext)) {
        return failClosed(response);
      }
      if (loginCompletion) {
        const consumed = await deps.returnHandles.consume(loginCompletion.handle);
        if (!matchesLoginCompletion(consumed, loginCompletion.payload)) {
          return failClosed(response);
        }
        expireLoginCompletionCookie(response, deps.env.oidc.cookieSecure);
      }
      else if (stagedFirstAuthentication) {
        expireLoginCompletionCookie(response, deps.env.oidc.cookieSecure);
      }
      await deps.provider.interactionFinished(request, response, {
        login: {
          accountId: session.accountId,
          ts: session.authTime,
          amr: ["iam"],
        },
      });
      return;
    }

    const browserBinding = createOpaqueValue();
    const returnTarget = new URL("/oidc/resume", deps.env.oidc.issuer).href;
    const handle = await deps.returnHandles.create({
      interactionUid: details.uid,
      clientId,
      oidcConfigVersion: client.oidc_config_version,
      browserBinding,
      returnTarget,
    }, deps.env.oidc.interactionTtlSeconds);
    if (!handle)
      return failClosed(response);
    const loginUrl = new URL(deps.env.oidc.ssoLoginPath, deps.env.oidc.publicOrigin);
    loginUrl.searchParams.set("oidcReturn", handle);
    redirect(
      response,
      loginUrl.href,
      serializeHttpOnlyCookie({
        maxAge: deps.env.oidc.interactionTtlSeconds,
        name: BROWSER_BINDING_COOKIE,
        path: "/oidc",
        secure: deps.env.oidc.cookieSecure,
        value: browserBinding,
      }),
    );
  }

  async function resolveBoundReturnHandle(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const url = new URL(request.url ?? "/", deps.env.oidc.publicOrigin);
    const handle = url.searchParams.get("oidcReturn");
    if (!handle) {
      failClosed(response);
      return null;
    }
    const payload = await deps.returnHandles.resolveReturnHandle(handle);
    const browserBinding = getCookieValue(request.headers.cookie, BROWSER_BINDING_COOKIE);
    const expectedReturnTarget = new URL("/oidc/resume", deps.env.oidc.issuer).href;
    if (!payload
      || payload.returnTarget !== expectedReturnTarget
      || !browserBinding
      || !secureStringEqual(payload.browserBinding, browserBinding)) {
      failClosed(response);
      return null;
    }
    await deps.trafficGate.assertIssuanceAllowed(payload.clientId);
    const client = await deps.clients.findRuntime(payload.clientId);
    if (!client || client.oidc_config_version !== payload.oidcConfigVersion) {
      failClosed(response);
      return null;
    }
    const interaction = await deps.interactionArtifacts.find(payload.interactionUid);
    if (!interaction
      || interaction.uid !== payload.interactionUid
      || interaction.clientId !== payload.clientId
      || interaction.promptName !== "login") {
      failClosed(response);
      return null;
    }
    return { handle, payload };
  }

  async function handleLoginGuard(request: IncomingMessage, response: ServerResponse) {
    const continuation = await resolveBoundReturnHandle(request, response);
    if (!continuation)
      return;
    const inspection = await deps.globalSessions.inspect(request);
    if (inspection.status === "invalid") {
      expireHttpOnlyCookie(
        response,
        deps.env.oidc.globalSessionCookie,
        deps.env.oidc.cookieSecure,
      );
    }
    if (inspection.status !== "valid") {
      const loginCompletion = await deps.returnHandles.create({
        ...continuation.payload,
        returnTarget: LOGIN_COMPLETION_RETURN_TARGET,
      }, deps.env.oidc.interactionTtlSeconds);
      if (!loginCompletion)
        return failClosed(response);
      setLoginCompletionCookie(
        response,
        loginCompletion,
        deps.env.oidc.interactionTtlSeconds,
        deps.env.oidc.cookieSecure,
      );
    }
    writeLoginGuardDecision(
      response,
      inspection.status === "valid"
        ? LoginPageGuardDecision.Continue
        : LoginPageGuardDecision.Login,
    );
  }

  async function handleResume(request: IncomingMessage, response: ServerResponse) {
    const continuation = await resolveBoundReturnHandle(request, response);
    if (!continuation)
      return;
    const session = await deps.globalSessions.resolve(request);
    if (!session)
      return failClosed(response);
    if (!await deps.returnHandles.consume(continuation.handle))
      return failClosed(response);
    const interactionUrl = new URL(
      `${deps.env.oidc.issuer}/interaction/${continuation.payload.interactionUid}`,
    );
    redirect(response, interactionUrl.href);
  }

  async function withSubjectAccessProtocolBoundary(
    request: IncomingMessage,
    response: ServerResponse,
    operation: () => Promise<void>,
  ) {
    try {
      await operation();
    }
    catch (error) {
      if (error instanceof errors.TemporarilyUnavailable) {
        response.statusCode = 503;
        response.setHeader("content-type", "application/json");
        response.setHeader("cache-control", "no-store");
        response.end(JSON.stringify({ error: "temporarily_unavailable" }));
        return;
      }
      if (error instanceof errors.InvalidClient)
        return failClosed(response);
      const handled = writeOidcSubjectAccessNodeResponse(error, response, {
        cookieName: deps.env.oidc.globalSessionCookie,
        cookieSecure: deps.env.oidc.cookieSecure,
        clearGlobalSessionCookie: getCookieValue(
          request.headers.cookie,
          deps.env.oidc.globalSessionCookie,
        ) !== null,
      });
      if (!handled)
        throw error;
    }
  }

  return {
    handleInteraction(request: IncomingMessage, response: ServerResponse) {
      return withSubjectAccessProtocolBoundary(
        request,
        response,
        () => handleInteraction(request, response),
      );
    },
    handleLoginGuard(request: IncomingMessage, response: ServerResponse) {
      return withSubjectAccessProtocolBoundary(
        request,
        response,
        () => handleLoginGuard(request, response),
      );
    },
    handleResume(request: IncomingMessage, response: ServerResponse) {
      return withSubjectAccessProtocolBoundary(
        request,
        response,
        () => handleResume(request, response),
      );
    },
  };
}

export type OidcInteractionHandler = ReturnType<typeof createOidcInteractionHandler>;
