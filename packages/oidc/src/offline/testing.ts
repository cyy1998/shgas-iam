import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { createOidcLogoutState } from "../logout-state";
import { createOidcState, digest, randomHandle, statePrefix } from "../state";
import { createOidcTokenState } from "../token-state";
import { decodeOfflineProviderModel, decodeOfflineProviderSession } from "./record";

/** Frozen Provider source fixtures and current protocol fixtures stay with their persistence owner. */
export function createOidcMaintenanceTestFixture(
  redis: Redis,
  namespace: string,
  trackKey: (key: string) => void,
) {
  const prefix = statePrefix(namespace);
  const state = createOidcState(redis, namespace);
  const tokens = createOidcTokenState(redis, namespace);
  const logout = createOidcLogoutState(redis, namespace);
  function owned(key: string) {
    trackKey(key);
    return key;
  }
  async function put(key: string, value: unknown) {
    owned(key);
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    if (key.startsWith("oidc:model:")) {
      decodeOfflineProviderModel(key, raw);
    }
    else if (
      key.startsWith("oidc:provider-session-principal:")
      || key.startsWith("oidc:provider-session-binding-lookup:")
      || key.startsWith("oidc:pending-provider-session-binding:")
    ) {
      decodeOfflineProviderSession(key, raw);
    }
    await redis.set(key, raw);
    return key;
  }
  return {
    async seedUnified(clientId = "alpha") {
      try {
        const identity = {
          userSessionId: randomUUID(),
          clientSessionId: randomUUID(),
          userSessionInstance: randomUUID(),
          clientSessionInstance: randomUUID(),
          issuedAt: Date.now(),
          expiresAt: Date.now() + 120000,
        };
        const bearer = `oa_${randomHandle()}`;
        const token = {
          issuer: "https://iam.example/oidc",
          ...identity,
          version: 1 as const,
          purpose: "oidc_access" as const,
          id: randomUUID(),
          digest: digest(bearer),
          clientId,
          scope: "openid",
        };
        await tokens.save(bearer, token);
        await redis.del(`${prefix}token-id:${token.id}`);
        const orphanBearer = `oa_${randomHandle()}`;
        await tokens.save(orphanBearer, { ...token, id: randomUUID(), digest: digest(orphanBearer) });
        await redis.del(`${prefix}token:${digest(orphanBearer)}`);
        const authorization = {
          issuer: "https://iam.example/oidc",
          clientId,
          redirectUri: "https://client.example/cb",
          scope: "openid",
          state: "state",
          responseMode: "query" as const,
          codeChallenge: "a".repeat(43),
          codeChallengeMethod: "S256" as const,
          prompt: "",
        };
        await state.saveCode({
          ...identity,
          ...authorization,
          version: 1,
          protocol: "oidc",
          codeId: randomHandle(),
        });
        await state.saveContinuation({ authorization, completionDigest: null }, "browser", 120);
        await logout.save({ issuer: "https://iam.example/oidc", clientId, hint: null, redirectUri: null, state: null }, "browser", 120);
        const keys = await redis.keys(`${prefix}*`);
        for (const key of keys) await redis.persist(key);
        return keys;
      }
      finally {
        (await redis.keys(`${prefix}*`)).forEach(owned);
      }
    },
    async seedUnknownUnifiedFamily() {
      const key = owned(`${prefix}future:${randomUUID()}`);
      await redis.set(key, "sensitive-fixture", "PX", 120000);
      return key;
    },
    async seedMalformedToken() {
      const key = owned(`${prefix}token:${digest(randomHandle())}`);
      await redis.set(key, "sensitive-fixture");
      return key;
    },
    async seedSource(clientId = "alpha") {
      const keys: string[] = [];
      const modelId = randomUUID();
      keys.push(
        await put(`oidc:model:Session:${modelId}`, {
          kind: "Session",
          jti: modelId,
          iat: 1,
          exp: 100,
          uid: randomUUID(),
        }),
      );
      // Controlled frozen shapes, not captured payloads. Actual Provider 9.9.1 writer
      // provenance is retained at aeb2dc45 / #193; the current CLI exercises all codecs.
      const accountId = randomUUID();
      const sessionUid = randomUUID();
      const grantId = randomUUID();
      const common = { iat: 1, exp: 100, clientId, oidcConfigVersion: 1, accountId };
      const snapshot = {
        version: 2,
        claimsContractVersion: 2,
        subjectIdentifier: accountId,
        clientId,
        scopes: ["openid"],
        oidcConfigVersion: 1,
        providerSessionUid: sessionUid,
        principalSessionId: randomUUID(),
        providerSessionBindingId: randomUUID(),
        claims: { sub: accountId },
      };
      keys.push(
        await put(`oidc:model:Grant:${grantId}`, {
          ...common,
          kind: "Grant",
          jti: grantId,
          openid: { scope: "openid" },
        }),
      );
      const codeId = randomUUID();
      keys.push(
        await put(`oidc:model:AuthorizationCode:${codeId}`, {
          ...common,
          kind: "AuthorizationCode",
          jti: codeId,
          authTime: 1,
          grantId,
          sessionUid,
          scope: "openid",
          redirectUri: "https://client.example/callback",
          codeChallenge: "a".repeat(43),
          codeChallengeMethod: "S256",
          claimsSnapshot: snapshot,
        }),
      );
      const tokenId = randomUUID();
      const kernelCredentialId = randomUUID();
      keys.push(
        await put(`oidc:model:AccessToken:${tokenId}`, {
          ...common,
          kind: "AccessToken",
          jti: tokenId,
          grantId,
          sessionUid,
          scope: "openid",
          gty: "authorization_code",
          kernelCredentialId,
          extra: { claimsSnapshot: snapshot, authTime: 1, kernelCredentialId },
        }),
      );
      const interactionId = randomUUID();
      keys.push(
        await put(`oidc:model:Interaction:${interactionId}`, {
          iat: 1,
          exp: 100,
          clientId,
          oidcConfigVersion: 1,
          kind: "Interaction",
          jti: interactionId,
          returnTo: "https://issuer.example/oidc/resume",
          params: {},
          prompt: { name: "login", reasons: [], details: {} },
        }),
      );
      keys.push(await put(`oidc:consumed:AuthorizationCode:${randomUUID()}`, "1"));
      keys.push(
        await put(`oidc:provider-session-principal:${randomUUID()}`, {
          accountId: randomUUID(),
          principalSessionId: randomUUID(),
          generation: randomUUID(),
        }),
      );
      keys.push(
        await put(`oidc:provider-session-binding-lookup:${randomUUID()}:${randomUUID()}`, {
          bindingId: randomUUID(),
          mappingOwnerId: randomUUID(),
        }),
      );
      keys.push(await put(`oidc:session-uid:${randomUUID()}`, modelId));
      keys.push(await put(`oidc:user-code:${randomUUID()}`, randomUUID()));
      const pendingId = randomUUID();
      const pendingClient = randomUUID();
      const pending = await put(`oidc:pending-provider-session-binding:${pendingId}`, {
        accountId: randomUUID(),
        authorizationAttemptId: pendingId,
        authTime: Date.now(),
        clientCode: pendingClient,
        expectedAnchorGeneration: null,
        expiresAt: Date.now() + 120000,
        oidcConfigVersion: 1,
        principalSessionId: randomUUID(),
        providerSessionUid: null,
      });
      keys.push(pending);
      for (const key of [`oidc:grant-objects:${grantId}`, `oidc:client-objects:${clientId}`]) {
        owned(key);
        keys.push(key);
        await redis.zadd(key, Date.now() + 120000, `oidc:model:AuthorizationCode:${randomUUID()}`);
      }
      const pendingIndex = owned(`oidc:pending-provider-session-bindings:client:${pendingClient}`);
      keys.push(pendingIndex);
      await redis.zadd(pendingIndex, Date.now() + 120000, pending);
      const membership = owned(`oidc:provider-session-generation-members:${randomUUID()}:${randomUUID()}`);
      await redis.sadd(membership, randomUUID());
      keys.push(membership);
      return keys;
    },
    async seedCorruptSource() {
      const key = owned(`oidc:model:Session:${randomUUID()}`);
      await redis.set(
        key,
        JSON.stringify({ kind: "Session", jti: "bad", iat: 1, exp: 2, uid: "sensitive-fixture" }),
      );
      return key;
    },
    async seedLargeSourceIndexes(count: number) {
      const index = owned(`oidc:client-objects:${randomUUID()}`);
      const membership = owned(`oidc:provider-session-generation-members:${randomUUID()}:${randomUUID()}`);
      const members = Array.from({ length: count }, () => randomUUID());
      await redis.zadd(
        index,
        ...members.flatMap(member => [Date.now() + 120000, `oidc:model:AuthorizationCode:${member}`]),
      );
      await redis.sadd(membership, ...members);
      return {
        indexCount: async () => await redis.zcard(index),
        membershipCount: async () => await redis.scard(membership),
      };
    },
  };
}
