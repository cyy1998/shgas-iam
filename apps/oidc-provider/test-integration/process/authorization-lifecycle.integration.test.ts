import type { AddressInfo } from "node:net";
import type { AdapterPayload } from "oidc-provider";
import type {
  ProviderSessionBinding,
  ProviderSessionLifecycleFence,
} from "../../src/session/provider-session.ts";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair } from "jose";
import Provider from "oidc-provider";
import { afterEach, describe, expect, it } from "vitest";
import { createOidcInteractionHandler } from "../../src/interaction/handler.ts";
import { createIamInteractionPolicy } from "../../src/interaction/policy.ts";
import { createOidcClaimsAdapter } from "../../src/provider/claims.ts";
import { createProviderConfiguration } from "../../src/provider/configuration.ts";
import { registerProtocolModelPayloadExtensions } from "../../src/provider/protocol-models.ts";
import { createOidcAdapterFactory } from "../../src/storage/redis-adapter.ts";

const subjectIdentifier = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";
const oldPrincipalSessionId = "principal-old";
const newPrincipalSessionId = "principal-new";
const concurrentPrincipalSessionIdA = "principal-concurrent-a";
const concurrentPrincipalSessionIdB = "principal-concurrent-b";
const providerIssuer = "http://issuer.test/oidc";
const codeVerifier = "a".repeat(64);
const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

class AuthorizationRedis {
  readonly strings = new Map<string, string>();
  readonly sortedSets = new Map<string, Map<string, number>>();

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }

  async mget(...keys: string[]) {
    return keys.map(key => this.strings.get(key) ?? null);
  }

  async set(key: string, value: string) {
    this.strings.set(key, value);
    return "OK";
  }

  async del(...keys: string[]) {
    for (const key of keys) {
      this.strings.delete(key);
      this.sortedSets.delete(key);
    }
    return keys.length;
  }

  async zrange(key: string) {
    return [...(this.sortedSets.get(key)?.entries() ?? [])]
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
  }

  async zremrangebyscore(key: string, _min: string, max: number) {
    const set = this.sortedSets.get(key);
    if (!set)
      return 0;
    let removed = 0;
    for (const [member, score] of set) {
      if (score <= Number(max)) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  async eval(_script: string, _keyCount: number, key: string, consumed: string | number, timestamp: string) {
    if (!this.strings.has(key))
      return 0;
    if (this.strings.has(String(consumed)))
      return -1;
    this.strings.set(String(consumed), timestamp);
    return 1;
  }

  multi() {
    const operations: Array<() => void> = [];
    const transaction = {
      set: (key: string, value: string) => {
        operations.push(() => this.strings.set(key, value));
        return transaction;
      },
      zadd: (key: string, score: number, member: string) => {
        operations.push(() => {
          const set = this.sortedSets.get(key) ?? new Map<string, number>();
          set.set(member, score);
          this.sortedSets.set(key, set);
        });
        return transaction;
      },
      zrem: (key: string, member: string) => {
        operations.push(() => this.sortedSets.get(key)?.delete(member));
        return transaction;
      },
      expire: () => transaction,
      exec: async () => {
        operations.forEach(operation => operation());
        return [];
      },
    };
    return transaction;
  }
}

function createProviderSessionStore(options: {
  isPrincipalValid?: (principalSessionId: string) => boolean;
  rejectEnsure?: boolean;
} = {}) {
  const bindings = new Map<string, ProviderSessionBinding>();
  const principalAnchors = new Map<string, {
    accountId: string;
    generation: string;
    principalSessionId: string;
  }>();
  const bindingCreationClientCodes: string[] = [];
  const stagedPrincipalSessionIds: string[] = [];
  let rejectNextBindingCommit = false;
  const pending = new Map<string, {
    accountId: string;
    authTime: number;
    clientCode: string;
    providerSessionUid: string | null;
    principalSessionId: string;
    userId: number;
  }>();
  const key = (sessionUid: string, clientCode: string) => `${sessionUid}:${clientCode}`;
  const createBinding = (
    sessionUid: string,
    session: {
      accountId: string;
      authTime: number;
      sessionId: string;
      userId: number;
    },
    clientCode: string,
    generation: string,
  ) => {
    if (rejectNextBindingCommit) {
      rejectNextBindingCommit = false;
      return null;
    }
    bindingCreationClientCodes.push(clientCode);
    const binding = {
      accountId: session.accountId,
      anchorGeneration: generation,
      authTime: session.authTime,
      bindingId: `binding-${clientCode}`,
      clientCode,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      globalSessionId: session.sessionId,
      oidcConfigVersion: 1,
      principalSessionId: session.sessionId,
      userId: session.userId,
    };
    bindings.set(key(sessionUid, clientCode), binding);
    principalAnchors.set(sessionUid, {
      accountId: session.accountId,
      generation,
      principalSessionId: session.sessionId,
    });
    return binding;
  };

  return {
    bindings,
    bindingCreationClientCodes,
    stagedPrincipalSessionIds,
    failNextBindingCommit() {
      rejectNextBindingCommit = true;
    },
    async destroyProviderSession(
      sessionUid: string,
      expected?: ProviderSessionLifecycleFence,
    ) {
      if (!expected?.generation || !expected.principalSessionId)
        return true;
      const anchor = principalAnchors.get(sessionUid);
      if (anchor?.generation !== expected.generation
        || anchor.principalSessionId !== expected.principalSessionId) {
        return true;
      }
      principalAnchors.delete(sessionUid);
      return true;
    },
    revokeClientBinding(sessionUid: string, clientCode: string) {
      bindings.delete(key(sessionUid, clientCode));
    },
    async bind(
      sessionUid: string,
      session: { accountId: string; authTime: number; sessionId: string; userId: number },
      context: { clientId: string },
    ) {
      return createBinding(sessionUid, session, context.clientId, `direct-${session.sessionId}`);
    },
    async consumeStaged(input: {
      accountId: string;
      authorizationAttemptId: string;
      clientCode: string;
      providerSessionUid: string;
    }) {
      const staged = pending.get(input.authorizationAttemptId);
      if (!staged)
        return null;
      if (staged.accountId !== input.accountId
        || staged.clientCode !== input.clientCode
        || (staged.providerSessionUid && staged.providerSessionUid !== input.providerSessionUid)) {
        return null;
      }
      pending.delete(input.authorizationAttemptId);
      const binding = createBinding(input.providerSessionUid, {
        accountId: staged.accountId,
        authTime: staged.authTime,
        sessionId: staged.principalSessionId,
        userId: staged.userId,
      }, input.clientCode, input.authorizationAttemptId);
      if (!binding)
        throw new Error("staged binding commit failed");
      return binding;
    },
    async ensureClientBinding(input: {
      accountId: string;
      anchorGeneration: string;
      clientCode: string;
      principalSessionId: string;
      providerSessionUid: string;
    }) {
      if (options.rejectEnsure)
        return null;
      if (input.accountId !== subjectIdentifier || options.isPrincipalValid?.(input.principalSessionId) === false)
        return null;
      const existing = bindings.get(key(input.providerSessionUid, input.clientCode));
      if (existing?.accountId === input.accountId
        && existing.anchorGeneration === input.anchorGeneration
        && existing.principalSessionId === input.principalSessionId) {
        return existing;
      }
      return createBinding(input.providerSessionUid, {
        accountId: subjectIdentifier,
        authTime: 123,
        sessionId: input.principalSessionId,
        userId: 7,
      }, input.clientCode, input.anchorGeneration);
    },
    async isCurrentOrStagedPrincipal(
      sessionUid: string,
      clientId: string,
      session: { accountId: string; sessionId: string },
      authorizationAttemptId: string | null,
    ) {
      const staged = authorizationAttemptId ? pending.get(authorizationAttemptId) : null;
      return session.accountId === subjectIdentifier
        && (principalAnchors.get(sessionUid)?.principalSessionId === session.sessionId
          || (staged?.accountId === session.accountId
            && staged.clientCode === clientId
            && staged.principalSessionId === session.sessionId
            && (staged.providerSessionUid === null || staged.providerSessionUid === sessionUid)));
    },
    async read(sessionUid: string, clientCode: string) {
      const binding = bindings.get(key(sessionUid, clientCode)) ?? null;
      return binding && options.isPrincipalValid?.(binding.principalSessionId) !== false
        ? binding
        : null;
    },
    async readPrincipalAnchor(sessionUid: string, accountId: string) {
      const anchor = principalAnchors.get(sessionUid) ?? null;
      return anchor?.accountId === accountId ? anchor : null;
    },
    async stage(
      session: { accountId: string; authTime: number; sessionId: string; userId: number },
      context: {
        authorizationAttemptId: string;
        clientId: string;
        providerSessionUid: string | null;
      },
    ) {
      stagedPrincipalSessionIds.push(session.sessionId);
      pending.set(context.authorizationAttemptId, {
        accountId: session.accountId,
        authTime: session.authTime,
        clientCode: context.clientId,
        providerSessionUid: context.providerSessionUid,
        principalSessionId: session.sessionId,
        userId: session.userId,
      });
      return {
        accountId: session.accountId,
        authTime: session.authTime,
        bindingId: "pending",
        clientCode: context.clientId,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        globalSessionId: session.sessionId,
        oidcConfigVersion: 1,
        principalSessionId: session.sessionId,
        userId: session.userId,
      };
    },
  };
}

async function createAuthorizationRuntime(options: { rejectEnsure?: boolean } = {}) {
  const redis = new AuthorizationRedis();
  let activePrincipalSessionId = oldPrincipalSessionId;
  const validPrincipalSessionIds = new Set([
    oldPrincipalSessionId,
    concurrentPrincipalSessionIdA,
    concurrentPrincipalSessionIdB,
  ]);
  const providerSessions = createProviderSessionStore({
    ...options,
    isPrincipalValid: principalSessionId => validPrincipalSessionIds.has(principalSessionId),
  });
  const clients = new Map<string, AdapterPayload>([
    ["client-a", {
      allowed_scopes: ["openid"],
      client_id: "client-a",
      grant_types: ["authorization_code"],
      iam_client_id: 1,
      id_token_signed_response_alg: "RS256",
      oidc_config_version: 1,
      redirect_uris: ["https://client-a.example/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }],
    ["client-b", {
      allowed_scopes: ["openid"],
      client_id: "client-b",
      grant_types: ["authorization_code"],
      iam_client_id: 2,
      id_token_signed_response_alg: "RS256",
      oidc_config_version: 1,
      redirect_uris: ["https://client-b.example/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }],
  ]);
  const globalSession = (principalSessionId: string) => ({
    accountId: subjectIdentifier,
    authTime: principalSessionId === oldPrincipalSessionId ? 123 : 456,
    sessionId: principalSessionId,
    userId: 7,
  });
  const principalSessionIdFromCookie = (cookie: string | undefined) => {
    if (cookie?.includes("global_session=principal-token-a"))
      return concurrentPrincipalSessionIdA;
    if (cookie?.includes("global_session=principal-token-b"))
      return concurrentPrincipalSessionIdB;
    return cookie?.includes("global_session=principal-token") ? activePrincipalSessionId : null;
  };
  const globalSessions = {
    async renew(sessionId: string) {
      return sessionId === activePrincipalSessionId;
    },
    async resolve(request: { headers: { cookie?: string } }) {
      const principalSessionId = principalSessionIdFromCookie(request.headers.cookie);
      return principalSessionId ? globalSession(principalSessionId) : null;
    },
    async resolveById(sessionId: string) {
      return validPrincipalSessionIds.has(sessionId)
        ? globalSession(sessionId)
        : null;
    },
  };
  const clientStore = {
    async findActiveVersion(clientId: string) {
      return clients.has(clientId) ? 1 : null;
    },
    async findRuntime(clientId: string) {
      return clients.get(clientId) as never ?? null;
    },
  };
  const claims = createOidcClaimsAdapter({
    accounts: {
      findBySubject: async (accountId: string) => accountId === subjectIdentifier
        ? {
            id: 7,
            isDelete: false,
            mobile: null,
            name: "Alice",
            status: 1,
            subjectIdentifier,
            username: "alice",
          }
        : null,
    },
    clients: clientStore,
    globalSessions,
    projection: {
      resolve: async () => ({ subjectIdentifier }),
    },
    providerSessions,
    tokens: {
      resolveAccessTokenCredential: async () => null,
      revokeAccessTokenCredential: async () => undefined,
    },
  } as never);
  const accessTokenCredentials = new Map<string, {
    credential: {
      clientCode: string;
      credentialId: string;
      principalSessionId: string;
    };
    metadata: {
      oidcConfigVersion: number;
      providerTokenId: string;
      providerTokenKey: string;
    };
  }>();
  const oidcSession = {
    consumeAuthorizationCodeArtifact: async () => ({}),
    registerAccessTokenCredential: async (input: {
      binding: ProviderSessionBinding | null;
      providerTokenId: string;
      providerTokenKey: string;
    }) => {
      if (!input.binding)
        return null;
      const credential = {
        clientCode: input.binding.clientCode,
        credentialId: `credential-${input.providerTokenId}`,
        principalSessionId: input.binding.principalSessionId,
      };
      accessTokenCredentials.set(input.providerTokenId, {
        credential,
        metadata: {
          oidcConfigVersion: input.binding.oidcConfigVersion,
          providerTokenId: input.providerTokenId,
          providerTokenKey: input.providerTokenKey,
        },
      });
      return credential;
    },
    registerAuthorizationCodeArtifact: async () => true,
    resolveAccessTokenCredential: async (providerTokenId: string) => {
      return accessTokenCredentials.get(providerTokenId) ?? null;
    },
    revokeAccessTokenCredential: async (credentialId: string) => {
      for (const [providerTokenId, value] of accessTokenCredentials) {
        if (value.credential.credentialId === credentialId)
          accessTokenCredentials.delete(providerTokenId);
      }
    },
    revokeClientProtocol: async () => undefined,
  };
  const adapter = createOidcAdapterFactory(redis as never, {
    claims,
    clients: clientStore,
    clientVersions: clientStore,
    oidcSession,
    providerSessions,
    tokens: { revokeAccessToken: async () => undefined },
  } as never);
  const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  const jwk = { ...await exportJWK(privateKey), alg: "RS256", kid: "current", use: "sig" };
  const provider = new Provider(providerIssuer, createProviderConfiguration({
    nodeEnv: "test",
    oidc: {
      accessTokenTtlSeconds: 3600,
      authorizationCodeTtlSeconds: 300,
      cookieKeys: ["a".repeat(32), "b".repeat(32)],
      cookieSecure: false,
      globalSessionTtlSeconds: 3600,
      idTokenTtlSeconds: 3600,
      interactionTtlSeconds: 600,
      issuer: providerIssuer,
    },
  } as never, {
    adapter,
    claims,
    currentSigningKey: { jwk } as never,
    interactionPolicy: createIamInteractionPolicy(globalSessions, providerSessions),
  }));
  registerProtocolModelPayloadExtensions(provider);
  const interactions = createOidcInteractionHandler({
    clients: clientStore,
    env: {
      nodeEnv: "test",
      oidc: {
        globalSessionCookie: "global_session",
        interactionTtlSeconds: 600,
        issuer: providerIssuer,
      },
    } as never,
    globalSessions,
    provider,
    providerSessions,
    returnHandles: {
      consume: async () => null,
      create: async () => null,
    },
  });
  const providerCallback = provider.callback();
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", providerIssuer).pathname;
    if (pathname.startsWith("/oidc/interaction/")) {
      void interactions.handleInteraction(request, response).catch((error) => {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : "interaction failed");
      });
      return;
    }
    providerCallback(request, response);
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    makeProviderSessionArtifactLegacy(providerSessionUid: string) {
      const sessionId = redis.strings.get(`oidc:session-uid:${providerSessionUid}`);
      if (!sessionId)
        throw new Error("Provider Session fixture is unavailable");
      const key = `oidc:model:Session:${sessionId}`;
      const serialized = redis.strings.get(key);
      if (!serialized)
        throw new Error("Provider Session artifact fixture is unavailable");
      const payload = JSON.parse(serialized) as Record<string, unknown>;
      if (payload.uid !== providerSessionUid || payload.accountId !== subjectIdentifier)
        throw new Error("Provider Session artifact fixture identity is invalid");
      delete payload.kernelPrincipalSessionId;
      delete payload.providerSessionAnchorGeneration;
      redis.strings.set(key, JSON.stringify(payload));
    },
    provider,
    providerSessions,
    rotatePrincipal(options: { keepPreviousValid?: boolean } = {}) {
      if (!options.keepPreviousValid)
        validPrincipalSessionIds.delete(activePrincipalSessionId);
      activePrincipalSessionId = newPrincipalSessionId;
      validPrincipalSessionIds.add(activePrincipalSessionId);
    },
    url: `http://127.0.0.1:${port}`,
  };
}

function createCookieJar(globalSessionToken = "principal-token") {
  const cookies = new Map([["global_session", globalSessionToken]]);
  return {
    absorb(response: Response) {
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(";", 1);
        const separator = pair?.indexOf("=") ?? -1;
        if (!pair || separator === -1)
          continue;
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value)
          cookies.set(name, value);
        else
          cookies.delete(name);
      }
    },
    header() {
      return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    },
  };
}

function authorizationUrl(url: string, clientId: string) {
  const redirectUri = `https://${clientId}.example/callback`;
  const authorization = new URL(`${url}/auth`);
  authorization.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid",
    state: `state-${clientId}`,
  }).toString();
  return { authorization, redirectUri };
}

async function requestRedirect(url: string, cookieJar: ReturnType<typeof createCookieJar>) {
  const response = await fetch(url, {
    headers: { cookie: cookieJar.header() },
    redirect: "manual",
  });
  cookieJar.absorb(response);
  return {
    location: response.headers.get("location"),
    response,
  };
}

async function beginInteractiveAuthorization(
  url: string,
  clientId: string,
  cookieJar: ReturnType<typeof createCookieJar>,
) {
  const { authorization } = authorizationUrl(url, clientId);
  const prompted = await requestRedirect(authorization.href, cookieJar);
  expect(prompted.location).toContain("/oidc/interaction/");
  const interactionTarget = new URL(prompted.location!, providerIssuer);
  const authorizationAttemptId = interactionTarget.pathname.split("/").at(-1);
  expect(authorizationAttemptId).toEqual(expect.any(String));
  const interaction = await requestRedirect(
    new URL(`${interactionTarget.pathname}${interactionTarget.search}`, url).href,
    cookieJar,
  );
  expect(interaction.location).toEqual(expect.any(String));
  const resume = new URL(interaction.location!, providerIssuer);
  return {
    authorizationAttemptId: authorizationAttemptId!,
    resumeUrl: new URL(`${resume.pathname}${resume.search}`, url).href,
  };
}

async function finishAuthorization(
  url: string,
  clientId: string,
  cookieJar: ReturnType<typeof createCookieJar>,
  next: string,
) {
  const { redirectUri } = authorizationUrl(url, clientId);
  for (let redirects = 0; redirects < 5; redirects += 1) {
    const redirected = await requestRedirect(next, cookieJar);
    if (!redirected.location)
      return { location: null, response: redirected.response };
    const target = new URL(redirected.location, providerIssuer);
    if (target.origin === new URL(redirectUri).origin)
      return { location: target, response: redirected.response };
    next = new URL(`${target.pathname}${target.search}`, url).href;
  }
  throw new Error("authorization redirect limit exceeded");
}

async function authorize(url: string, clientId: string, cookieJar: ReturnType<typeof createCookieJar>) {
  const { authorization } = authorizationUrl(url, clientId);
  return await finishAuthorization(url, clientId, cookieJar, authorization.href);
}

async function exchangeAuthorizationCode(url: string, clientId: string, code: string) {
  const { redirectUri } = authorizationUrl(url, clientId);
  return await fetch(`${url}/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
}

describe("oIDC authorization Provider Session lifecycle", () => {
  it("keeps concurrent first-login attempts isolated for the same account and client", async () => {
    const { provider, providerSessions, url } = await createAuthorizationRuntime();
    const cookiesA = createCookieJar("principal-token-a");
    const cookiesB = createCookieJar("principal-token-b");

    const attemptA = await beginInteractiveAuthorization(url, "client-a", cookiesA);
    const attemptB = await beginInteractiveAuthorization(url, "client-a", cookiesB);
    expect(attemptA.authorizationAttemptId).not.toBe(attemptB.authorizationAttemptId);
    const authorizedA = await finishAuthorization(url, "client-a", cookiesA, attemptA.resumeUrl);
    const authorizedB = await finishAuthorization(url, "client-a", cookiesB, attemptB.resumeUrl);

    const codeA = authorizedA.location?.searchParams.get("code");
    const codeB = authorizedB.location?.searchParams.get("code");
    expect(codeA).toEqual(expect.any(String));
    expect(codeB).toEqual(expect.any(String));
    const storedCodeA = await provider.AuthorizationCode.find(codeA!);
    const storedCodeB = await provider.AuthorizationCode.find(codeB!);
    expect(storedCodeA).toMatchObject({
      authorizationAttemptId: attemptA.authorizationAttemptId,
      claimsSnapshot: { principalSessionId: concurrentPrincipalSessionIdA },
    });
    expect(storedCodeB).toMatchObject({
      authorizationAttemptId: attemptB.authorizationAttemptId,
      claimsSnapshot: { principalSessionId: concurrentPrincipalSessionIdB },
    });
    expect(providerSessions.stagedPrincipalSessionIds).toEqual([
      concurrentPrincipalSessionIdA,
      concurrentPrincipalSessionIdB,
    ]);
  }, 15_000);

  it("silently authorizes a second client with its own binding before issuing its code", async () => {
    const { provider, providerSessions, url } = await createAuthorizationRuntime();
    const cookies = createCookieJar();

    const authorizedA = await authorize(url, "client-a", cookies);
    expect(authorizedA.location?.searchParams.get("code")).toEqual(expect.any(String));
    const providerSessionUid = [...providerSessions.bindings.keys()][0]?.split(":", 1)[0];
    expect(providerSessionUid).toEqual(expect.any(String));
    expect(await providerSessions.read(providerSessionUid!, "client-b")).toBeNull();
    const providerSession = await provider.Session.findByUid(providerSessionUid!);
    expect(providerSession).toMatchObject({
      accountId: subjectIdentifier,
      kernelPrincipalSessionId: oldPrincipalSessionId,
    });

    const authorizedB = await authorize(url, "client-b", cookies);

    const code = authorizedB.location?.searchParams.get("code");
    expect(code).toEqual(expect.any(String));
    const bindingB = await providerSessions.read(providerSessionUid!, "client-b");
    expect(bindingB).toMatchObject({
      accountId: subjectIdentifier,
      clientCode: "client-b",
      principalSessionId: oldPrincipalSessionId,
    });
    const storedCode = await provider.AuthorizationCode.find(code!);
    expect((storedCode as unknown as { claimsSnapshot: unknown }).claimsSnapshot).toMatchObject({
      clientId: "client-b",
      principalSessionId: oldPrincipalSessionId,
      providerSessionBindingId: bindingB?.bindingId,
      providerSessionUid,
      subjectIdentifier,
    });
  });

  it("keeps client A anchored and snapshotted after independently revoking silent client B", async () => {
    const { provider, providerSessions, url } = await createAuthorizationRuntime();
    const cookies = createCookieJar();
    const authorizedA = await authorize(url, "client-a", cookies);
    expect(authorizedA.location?.searchParams.get("code")).toEqual(expect.any(String));
    const providerSessionUid = [...providerSessions.bindings.keys()][0]?.split(":", 1)[0];
    expect(providerSessionUid).toEqual(expect.any(String));
    const bindingA = await providerSessions.read(providerSessionUid!, "client-a");
    expect(bindingA).not.toBeNull();
    const authorizedB = await authorize(url, "client-b", cookies);
    expect(authorizedB.location?.searchParams.get("code")).toEqual(expect.any(String));
    providerSessions.revokeClientBinding(providerSessionUid!, "client-b");
    const stagedBeforeRetry = providerSessions.stagedPrincipalSessionIds.length;
    const creationsBeforeRetry = providerSessions.bindingCreationClientCodes.length;

    const authorizedAAgain = await authorize(url, "client-a", cookies);

    expect(providerSessions.stagedPrincipalSessionIds).toHaveLength(stagedBeforeRetry);
    expect(providerSessions.bindingCreationClientCodes).toHaveLength(creationsBeforeRetry);
    await expect(providerSessions.read(providerSessionUid!, "client-a")).resolves.toMatchObject({
      bindingId: bindingA?.bindingId,
      principalSessionId: oldPrincipalSessionId,
    });
    const code = authorizedAAgain.location?.searchParams.get("code");
    expect(code).toEqual(expect.any(String));
    const storedCode = await provider.AuthorizationCode.find(code!);
    expect((storedCode as unknown as { claimsSnapshot: unknown }).claimsSnapshot).toMatchObject({
      clientId: "client-a",
      principalSessionId: oldPrincipalSessionId,
      providerSessionBindingId: bindingA?.bindingId,
      providerSessionUid,
    });
  });

  it("rebinds the Provider Session before issuing a code after the same account rotates Principal Session", async () => {
    const { provider, providerSessions, rotatePrincipal, url } = await createAuthorizationRuntime();
    const cookies = createCookieJar();
    const authorizedOld = await authorize(url, "client-a", cookies);
    expect(authorizedOld.location?.searchParams.get("code")).toEqual(expect.any(String));
    const providerSessionUid = [...providerSessions.bindings.keys()][0]?.split(":", 1)[0];
    expect(providerSessionUid).toEqual(expect.any(String));
    const stagedBeforeRotation = providerSessions.stagedPrincipalSessionIds.length;
    rotatePrincipal();

    const authorizedNew = await authorize(url, "client-a", cookies);

    expect(providerSessions.stagedPrincipalSessionIds.slice(stagedBeforeRotation)).toContain(newPrincipalSessionId);
    const code = authorizedNew.location?.searchParams.get("code");
    expect(code).toEqual(expect.any(String));
    await expect(provider.Session.findByUid(providerSessionUid!)).resolves.toMatchObject({
      accountId: subjectIdentifier,
      kernelPrincipalSessionId: newPrincipalSessionId,
    });
    const binding = [...providerSessions.bindings.values()]
      .find(candidate => candidate.clientCode === "client-a");
    expect(binding).toMatchObject({
      accountId: subjectIdentifier,
      principalSessionId: newPrincipalSessionId,
    });
    const storedCode = await provider.AuthorizationCode.find(code!);
    expect((storedCode as unknown as { claimsSnapshot: unknown }).claimsSnapshot).toMatchObject({
      clientId: "client-a",
      principalSessionId: newPrincipalSessionId,
      providerSessionBindingId: binding?.bindingId,
      providerSessionUid,
      subjectIdentifier,
    });
  });

  it("preserves a rotated anchor while upgrading a legacy Provider Session lifecycle fence", async () => {
    const {
      makeProviderSessionArtifactLegacy,
      provider,
      providerSessions,
      rotatePrincipal,
      url,
    } = await createAuthorizationRuntime();
    const cookies = createCookieJar();
    const authorizedOld = await authorize(url, "client-a", cookies);
    expect(authorizedOld.location?.searchParams.get("code")).toEqual(expect.any(String));
    const providerSessionUid = [...providerSessions.bindings.keys()][0]?.split(":", 1)[0];
    expect(providerSessionUid).toEqual(expect.any(String));
    rotatePrincipal();
    const pendingRotation = await beginInteractiveAuthorization(url, "client-a", cookies);
    makeProviderSessionArtifactLegacy(providerSessionUid!);

    const rotated = await finishAuthorization(
      url,
      "client-a",
      cookies,
      pendingRotation.resumeUrl,
    );

    const rotatedCode = rotated.location?.searchParams.get("code");
    expect(rotatedCode).toEqual(expect.any(String));
    const anchor = await providerSessions.readPrincipalAnchor(
      providerSessionUid!,
      subjectIdentifier,
    );
    expect(anchor).toMatchObject({ principalSessionId: newPrincipalSessionId });
    const binding = await providerSessions.read(providerSessionUid!, "client-a");
    expect(binding).toMatchObject({ principalSessionId: newPrincipalSessionId });
    await expect(provider.Session.findByUid(providerSessionUid!)).resolves.toMatchObject({
      kernelPrincipalSessionId: newPrincipalSessionId,
      providerSessionAnchorGeneration: anchor?.generation,
    });
    await expect(provider.AuthorizationCode.find(rotatedCode!)).resolves.toMatchObject({
      claimsSnapshot: {
        principalSessionId: newPrincipalSessionId,
        providerSessionBindingId: binding?.bindingId,
      },
    });
    const stagesBeforeSilent = providerSessions.stagedPrincipalSessionIds.length;
    const creationsBeforeSilent = providerSessions.bindingCreationClientCodes.length;

    const silent = await authorize(url, "client-a", cookies);

    expect(providerSessions.stagedPrincipalSessionIds).toHaveLength(stagesBeforeSilent);
    expect(providerSessions.bindingCreationClientCodes).toHaveLength(creationsBeforeSilent);
    const silentCode = silent.location?.searchParams.get("code");
    expect(silentCode).toEqual(expect.any(String));
    await expect(provider.AuthorizationCode.find(silentCode!)).resolves.toMatchObject({
      claimsSnapshot: {
        principalSessionId: newPrincipalSessionId,
        providerSessionBindingId: binding?.bindingId,
      },
    });
    const tokenResponse = await exchangeAuthorizationCode(url, "client-a", silentCode!);
    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json() as { access_token: string };
    await expect(provider.AccessToken.find(tokens.access_token)).resolves.toMatchObject({
      accountId: subjectIdentifier,
      sessionUid: providerSessionUid,
    });
  });

  it("keeps the old Provider Session ownership when Principal rotation cannot commit", async () => {
    const { provider, providerSessions, rotatePrincipal, url } = await createAuthorizationRuntime();
    const cookies = createCookieJar();
    const authorizedOld = await authorize(url, "client-a", cookies);
    expect(authorizedOld.location?.searchParams.get("code")).toEqual(expect.any(String));
    const providerSessionUid = [...providerSessions.bindings.keys()][0]?.split(":", 1)[0];
    expect(providerSessionUid).toEqual(expect.any(String));
    const oldBinding = await providerSessions.read(providerSessionUid!, "client-a");
    expect(oldBinding).not.toBeNull();
    rotatePrincipal({ keepPreviousValid: true });
    providerSessions.failNextBindingCommit();

    const rejectedRotation = await authorize(url, "client-a", cookies);

    expect(rejectedRotation.location?.searchParams.get("code") ?? null).toBeNull();
    await expect(provider.Session.findByUid(providerSessionUid!)).resolves.toMatchObject({
      accountId: subjectIdentifier,
      kernelPrincipalSessionId: oldPrincipalSessionId,
    });
    await expect(providerSessions.read(providerSessionUid!, "client-a")).resolves.toMatchObject({
      bindingId: oldBinding?.bindingId,
      principalSessionId: oldPrincipalSessionId,
    });
  });

  it("does not issue a code when the second client binding cannot be ensured", async () => {
    const { providerSessions, url } = await createAuthorizationRuntime({ rejectEnsure: true });
    const cookies = createCookieJar();
    const authorizedA = await authorize(url, "client-a", cookies);
    expect(authorizedA.location?.searchParams.get("code")).toEqual(expect.any(String));
    const providerSessionUid = [...providerSessions.bindings.keys()][0]?.split(":", 1)[0];
    expect(providerSessionUid).toEqual(expect.any(String));

    const authorizedB = await authorize(url, "client-b", cookies);

    expect(authorizedB.location?.searchParams.get("code") ?? null).toBeNull();
    await expect(providerSessions.read(providerSessionUid!, "client-b")).resolves.toBeNull();
  });
});
