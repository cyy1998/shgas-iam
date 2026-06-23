import type { IncomingMessage, ServerResponse } from "node:http";
import type Provider from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type {
  InteractionClientReader,
  InteractionGlobalSessionResolver,
  InteractionProviderSessionBindingStore,
  InteractionReturnHandleStore,
} from "./interaction.port.ts";
import { getCookieValue, requestNeedsReauthentication } from "./global-session.ts";
import {
  createOpaqueValue,
  secureStringEqual,
} from "./return-handle.ts";

const BROWSER_BINDING_COOKIE = "oidc_interaction_binding";

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

export interface CreateOidcInteractionHandlerDeps {
  provider: Provider;
  clients: InteractionClientReader;
  globalSessions: InteractionGlobalSessionResolver;
  providerSessions: InteractionProviderSessionBindingStore;
  returnHandles: InteractionReturnHandleStore;
  env: OidcProviderEnv;
}

export function createOidcInteractionHandler(deps: CreateOidcInteractionHandlerDeps) {
  return {
    async handleInteraction(request: IncomingMessage, response: ServerResponse) {
      const details = await deps.provider.interactionDetails(request, response);
      const clientId = typeof details.params.client_id === "string" ? details.params.client_id : null;
      if (!clientId || details.prompt.name !== "login")
        return failClosed(response);
      const client = await deps.clients.findRuntime(clientId);
      if (!client)
        return failClosed(response);

      const session = await deps.globalSessions.resolve(request);
      if (session && !requestNeedsReauthentication(details.params, session.authTime)) {
        await deps.globalSessions.renew(session.sessionId);
        const bindingContext = {
          clientId,
          oidcConfigVersion: client.oidc_config_version,
        };
        if (details.session?.uid) {
          if (!await deps.providerSessions.bind(details.session.uid, session, bindingContext))
            return failClosed(response);
        }
        else if (!await deps.providerSessions.stage(session, bindingContext)) {
          return failClosed(response);
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
      const returnTarget = new URL("/oidc/resume", deps.env.OIDC_ISSUER).href;
      const handle = await deps.returnHandles.create({
        interactionUid: details.uid,
        clientId,
        oidcConfigVersion: client.oidc_config_version,
        browserBinding,
        returnTarget,
      }, deps.env.OIDC_INTERACTION_TTL_SECONDS);
      if (!handle)
        return failClosed(response);
      const loginUrl = new URL(deps.env.OIDC_SSO_LOGIN_PATH, deps.env.OIDC_PUBLIC_ORIGIN);
      loginUrl.searchParams.set("oidcReturn", handle);
      const secure = deps.env.NODE_ENV === "production" ? "; Secure" : "";
      redirect(
        response,
        loginUrl.href,
        `${BROWSER_BINDING_COOKIE}=${browserBinding}; Path=/oidc; HttpOnly; SameSite=Lax; Max-Age=${deps.env.OIDC_INTERACTION_TTL_SECONDS}${secure}`,
      );
    },

    async handleResume(request: IncomingMessage, response: ServerResponse) {
      const url = new URL(request.url ?? "/", deps.env.OIDC_PUBLIC_ORIGIN);
      const handle = url.searchParams.get("oidcReturn");
      if (!handle)
        return failClosed(response);
      const payload = await deps.returnHandles.consume(handle);
      const browserBinding = getCookieValue(request.headers.cookie, BROWSER_BINDING_COOKIE);
      if (!payload || !browserBinding || !secureStringEqual(payload.browserBinding, browserBinding))
        return failClosed(response);

      const client = await deps.clients.findRuntime(payload.clientId);
      if (!client || client.oidc_config_version !== payload.oidcConfigVersion)
        return failClosed(response);
      const session = await deps.globalSessions.resolve(request);
      if (!session)
        return failClosed(response);

      const interactionUrl = new URL(
        `${deps.env.OIDC_ISSUER}/interaction/${payload.interactionUid}`,
      );
      redirect(response, interactionUrl.href);
    },
  };
}

export type OidcInteractionHandler = ReturnType<typeof createOidcInteractionHandler>;
