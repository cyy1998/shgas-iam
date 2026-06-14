import type { Redis } from "ioredis";
import type { IncomingMessage, ServerResponse } from "node:http";
import type Provider from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type { OidcClientRepository } from "../repositories/client.repository.ts";
import type { GlobalSessionResolver } from "./global-session.ts";
import { bindProviderSession } from "../session/provider-session.ts";
import { getCookieValue, requestNeedsReauthentication } from "./global-session.ts";
import {
  consumeOidcReturnHandle,
  createOidcReturnHandle,
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

export class OidcInteractionHandler {
  constructor(
    private readonly provider: Provider,
    private readonly redis: Redis,
    private readonly clients: OidcClientRepository,
    private readonly globalSessions: GlobalSessionResolver,
    private readonly env: OidcProviderEnv,
  ) {}

  async handleInteraction(request: IncomingMessage, response: ServerResponse) {
    const details = await this.provider.interactionDetails(request, response);
    const clientId = typeof details.params.client_id === "string" ? details.params.client_id : null;
    if (!clientId || details.prompt.name !== "login")
      return failClosed(response);
    const client = await this.clients.findRuntime(clientId);
    if (!client)
      return failClosed(response);

    const session = await this.globalSessions.resolve(request);
    if (session && !requestNeedsReauthentication(details.params, session.authTime)) {
      await this.globalSessions.renew(session.sessionId);
      if (!details.session?.uid || !await bindProviderSession(this.redis, details.session.uid, session))
        return failClosed(response);
      await this.provider.interactionFinished(request, response, {
        login: {
          accountId: session.accountId,
          ts: session.authTime,
          amr: ["iam"],
        },
      });
      return;
    }

    const browserBinding = createOpaqueValue();
    const handle = await createOidcReturnHandle(this.redis, {
      interactionUid: details.uid,
      clientId,
      oidcConfigVersion: client.oidc_config_version,
      browserBinding,
    }, this.env.OIDC_INTERACTION_TTL_SECONDS);
    const loginUrl = new URL(this.env.OIDC_SSO_LOGIN_PATH, this.env.OIDC_PUBLIC_ORIGIN);
    loginUrl.searchParams.set("oidcReturn", handle);
    const secure = this.env.NODE_ENV === "production" ? "; Secure" : "";
    redirect(
      response,
      loginUrl.href,
      `${BROWSER_BINDING_COOKIE}=${browserBinding}; Path=/oidc; HttpOnly; SameSite=Lax; Max-Age=${this.env.OIDC_INTERACTION_TTL_SECONDS}${secure}`,
    );
  }

  async handleResume(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", this.env.OIDC_PUBLIC_ORIGIN);
    const handle = url.searchParams.get("oidcReturn");
    if (!handle)
      return failClosed(response);
    const payload = await consumeOidcReturnHandle(this.redis, handle);
    const browserBinding = getCookieValue(request.headers.cookie, BROWSER_BINDING_COOKIE);
    if (!payload || !browserBinding || !secureStringEqual(payload.browserBinding, browserBinding))
      return failClosed(response);

    const client = await this.clients.findRuntime(payload.clientId);
    if (!client || client.oidc_config_version !== payload.oidcConfigVersion)
      return failClosed(response);
    const details = await this.provider.interactionDetails(request, response);
    const interactionClientId = typeof details.params.client_id === "string" ? details.params.client_id : null;
    if (details.uid !== payload.interactionUid || interactionClientId !== payload.clientId)
      return failClosed(response);
    const session = await this.globalSessions.resolve(request);
    if (!session)
      return failClosed(response);

    await this.globalSessions.renew(session.sessionId);
    if (!details.session?.uid || !await bindProviderSession(this.redis, details.session.uid, session))
      return failClosed(response);
    await this.provider.interactionFinished(request, response, {
      login: {
        accountId: session.accountId,
        ts: session.authTime,
        amr: ["iam"],
      },
    });
  }
}
