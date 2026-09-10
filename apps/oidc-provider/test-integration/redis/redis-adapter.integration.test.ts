import type Redis from "ioredis";
import type { CreateOidcAuthorizationCodeSnapshotInput } from "../../src/provider/claims/claims-snapshot.ts";
import type { AdapterOidcSessionKernel } from "../../src/storage/redis-adapter.port.ts";
import type {
  OidcProviderRedisTestHarness,
  OidcProviderRedisTestScope,
} from "./redis-test-harness.ts";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import Provider, { interactionPolicy } from "oidc-provider";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createOidcClientTrafficGate } from "../../src/provider/client/client-traffic-gate.ts";
import { createProviderConfiguration } from "../../src/provider/configuration.ts";
import { registerProtocolModelPayloadExtensions } from "../../src/provider/protocol-models.ts";
import { createOidcProtocolObjectStore, RedisOidcAdapter } from "../../src/storage/redis-adapter.ts";
import { createOidcTokenStore } from "../../src/stores/token.store.ts";
import { createOidcProviderRedisTestHarness } from "./redis-test-harness.ts";

let harness: OidcProviderRedisTestHarness | undefined;
let scope: OidcProviderRedisTestScope | undefined;
const SUBJECT_IDENTIFIER = "00000000-0000-4000-8000-000000000007";

beforeAll(async () => {
  harness = await createOidcProviderRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createScope();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await scope?.close();
  scope = undefined;
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("redis OIDC adapter real Redis contract", () => {
  it.each([-120_000, 120_000])("keeps Session and Interaction reads and updates in Redis time across writers at offset %i", async (offset) => {
    const testScope = scope!;
    const prefix = `${testScope.unique("interaction-time")}:`;
    testScope.trackPrefix(prefix);
    const configuration = {
      adapter: (name: string) => createAdapter(testScope, name, { keyPrefix: prefix }),
      cookies: { names: { interaction: "time-interaction" }, short: { signed: false, secure: false } },
    };
    const writer = new Provider("http://issuer.test", configuration);
    const reader = new Provider("http://issuer.test", configuration);
    registerProtocolModelPayloadExtensions(writer);
    registerProtocolModelPayloadExtensions(reader);
    const nativeNow = Date.now.bind(Date);
    let currentOffset = offset;
    vi.spyOn(Date, "now").mockImplementation(() => nativeNow() + currentOffset);
    const session = new writer.Session();
    session.loginAccount({ accountId: SUBJECT_IDENTIFIER });
    await session.save(30);
    const interaction = new writer.Interaction();
    Object.assign(interaction, {
      jti: testScope.unique("interaction"),
      returnTo: "http://issuer.test/resume",
      prompt: { name: "login", reasons: [], details: {} },
      params: {},
      session: { accountId: SUBJECT_IDENTIFIER, uid: session.uid, cookie: session.jti },
    });
    await interaction.save(30);
    const sessionKey = `${prefix}oidc:model:Session:${session.jti}`;
    const interactionKey = `${prefix}oidc:model:Interaction:${interaction.jti}`;
    const initialSessionDeadline = await testScope.observer.pexpiretime(sessionKey);
    const interactionDeadline = await testScope.observer.pexpiretime(interactionKey);
    currentOffset = -offset;
    const loadedSession = await reader.Session.findByUid(session.uid);
    expect(loadedSession?.uid).toBe(session.uid);
    expect(loadedSession).toMatchObject({ isExpired: false });
    const req = new IncomingMessage(new Socket());
    req.headers = { host: "issuer.test", cookie: `time-interaction=${interaction.jti}` };
    const res = new ServerResponse(req);
    const details = await reader.interactionDetails(req, res);
    expect(details.uid).toBe(interaction.jti);
    currentOffset = offset;
    const returnTo = await reader.interactionResult(req, res, { login: { accountId: SUBJECT_IDENTIFIER } });
    expect(returnTo).toBe("http://issuer.test/resume");
    const afterInteraction = await testScope.observer.pexpiretime(interactionKey);
    expect(afterInteraction).toBe(interactionDeadline);
    await loadedSession!.persist();
    const afterPersist = await testScope.observer.pexpiretime(sessionKey);
    expect(afterPersist).toBe(initialSessionDeadline);
    // Normal Session.save is an explicit rolling renewal, unlike persist.
    await loadedSession!.save(60);
    const afterRenew = await testScope.observer.pexpiretime(sessionKey);
    const lookupDeadline = await testScope.observer.pexpiretime(`${prefix}oidc:session-uid:${session.uid}`);
    expect(afterRenew).toBeGreaterThan(initialSessionDeadline + 25_000);
    expect(lookupDeadline).toBe(afterRenew);
    const storedSession = JSON.parse((await testScope.observer.get(sessionKey))!);
    expect(storedSession.redisLifetimeObserved).toBeUndefined();
    expect(storedSession.redisPreserveDeadline).toBeUndefined();
    expect(storedSession.redisObservedId).toBeUndefined();
    const loadedInteraction = await reader.Interaction.find(interaction.jti);
    await testScope.observer.del(sessionKey, interactionKey);
    for (const update of [
      () => loadedSession!.persist(),
      () => loadedSession!.save(60),
      () => loadedInteraction!.persist(),
    ]) {
      let failure;
      try {
        await update();
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
    }
    const missing = await testScope.observer.mget(sessionKey, interactionKey);
    expect(missing).toEqual([null, null]);
    const nextSession = await reader.Session.find(session.jti);
    const nextInteraction = await reader.Interaction.find(interaction.jti);
    expect(nextSession).toBeUndefined();
    expect(nextInteraction).toBeUndefined();
  });

  it.each([-120_000, 120_000])("preserves a loaded Grant deadline through model and production hook saves at offset %i", async (offset) => {
    const testScope = scope!;
    const prefix = `${testScope.unique("grant-resave")}:`;
    testScope.trackPrefix(prefix);
    const provider = new Provider("http://issuer.test", {
      adapter: name => createAdapter(testScope, name, { keyPrefix: prefix }),
      ttl: { Grant: 2 },
    });
    registerProtocolModelPayloadExtensions(provider);
    const clientId = testScope.unique("client");
    const grant = new provider.Grant({ accountId: SUBJECT_IDENTIFIER, clientId });
    grant.addOIDCScope("openid");
    await grant.save();
    const key = `${prefix}oidc:model:Grant:${grant.jti}`;
    const deadline = await testScope.observer.pexpiretime(key);
    const initialTtl = await testScope.observer.pttl(key);
    const nativeNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => nativeNow() + offset);
    const loaded = await provider.Grant.find(grant.jti);
    expect(loaded).toBeDefined();
    // Let independent Redis time pass after acquisition before the model supplies remainingTTL.
    await vi.waitFor(async () => {
      expect(await testScope.observer.pttl(key)).toBeLessThan(initialTtl - 20);
    }, { timeout: 1000, interval: 10 });
    loaded!.addOIDCScope("profile");
    await loaded!.save();
    expect(await testScope.observer.pexpiretime(key)).toBe(deadline);
    const configuration = createProviderConfiguration({ oidc: {} } as never, {
      adapter: name => createAdapter(testScope, name, { keyPrefix: prefix }),
      claims: {} as never,
      currentSigningKey: { jwk: {} } as never,
      interactionPolicy: interactionPolicy.base(),
      trafficGate: { assertIssuanceAllowed: async () => undefined, assertOnlineAccessAllowed: async () => undefined },
    });
    const refreshed = await configuration.loadExistingGrant!({ oidc: {
      account: { accountId: SUBJECT_IDENTIFIER },
      client: { clientId },
      provider,
      session: { grantIdFor: () => grant.jti },
      params: { scope: "email" },
    } } as never);
    expect(refreshed).toBeDefined();
    expect(await testScope.observer.pexpiretime(key)).toBe(deadline);
    expect(Number(await testScope.observer.zscore(`${prefix}oidc:client-objects:${clientId}`, key))).toBe(deadline);
    const stored = JSON.parse((await testScope.observer.get(key))!);
    expect(stored.redisLifetimeObserved).toBeUndefined();
    expect(stored.exp).toBe(loaded!.exp);
    const beforeDelete = await provider.Grant.find(grant.jti);
    await testScope.observer.del(key);
    let failure;
    try {
      await beforeDelete!.save();
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(await testScope.observer.get(key)).toBeNull();
    expect(await provider.Grant.find(grant.jti)).toBeUndefined();
  });

  it.each([-5_000, 0, 5_000])("keeps Redis deadlines and Grant/Client cleanup complete with application offset %i", async (offset) => {
    const testScope = scope!;
    const prefix = `${testScope.unique("clock")}:`;
    testScope.trackPrefix(prefix);
    const nativeNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => nativeNow() + offset);
    for (const cleanupBy of ["grant", "client"]) {
      const clientId = testScope.unique("client");
      const grantId = testScope.unique("grant");
      const longId = testScope.unique("long");
      const shortId = testScope.unique("short");
      const userCode = testScope.unique("user-code");
      const longKey = `${prefix}oidc:model:DeviceCode:${longId}`;
      const shortKey = `${prefix}oidc:model:DeviceCode:${shortId}`;
      const lookupKey = `${prefix}oidc:user-code:${userCode}`;
      const grantIndex = `${prefix}oidc:grant-objects:${grantId}`;
      const clientIndex = `${prefix}oidc:client-objects:${clientId}`;
      const firstWriter = createAdapter(testScope, "DeviceCode", { keyPrefix: prefix });
      const secondWriter = createAdapter(testScope, "DeviceCode", { keyPrefix: prefix, redis: testScope.observer });
      clock.mockImplementation(() => nativeNow() + offset);
      await firstWriter.upsert(longId, { clientId, grantId, userCode }, 60);
      clock.mockImplementation(() => nativeNow() - offset);
      await secondWriter.upsert(shortId, { clientId, grantId }, 30);
      await secondWriter.upsert(shortId, { clientId, grantId }, 1);

      const deadline = await testScope.observer.pexpiretime(longKey);
      const lookupDeadline = await testScope.observer.pexpiretime(lookupKey);
      const indexDeadlines = await Promise.all([grantIndex, clientIndex]
        .map(key => testScope.observer.pexpiretime(key)));
      const longScores = await Promise.all([grantIndex, clientIndex]
        .map(key => testScope.observer.zscore(key, longKey)));
      const shortDeadline = await testScope.observer.pexpiretime(shortKey);
      const shortScores = await Promise.all([grantIndex, clientIndex]
        .map(key => testScope.observer.zscore(key, shortKey)));
      const [seconds, micros] = await testScope.observer.time();
      const redisNow = Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
      expect(deadline - redisNow).toBeGreaterThan(55_000);
      expect(deadline - redisNow).toBeLessThanOrEqual(60_000);
      expect(lookupDeadline).toBe(deadline);
      expect(indexDeadlines).toEqual([deadline, deadline]);
      expect(longScores.map(Number)).toEqual([deadline, deadline]);
      expect(shortScores.map(Number)).toEqual([shortDeadline, shortDeadline]);
      const inventory = createOidcProtocolObjectStore(testScope.observer, { keyPrefix: prefix });
      const before = await inventory.inspectClient(clientId);
      expect(before.counts).toEqual({ total: 2, stale: 0, invalid: 0, byModel: { DeviceCode: 2 } });

      clock.mockImplementation(() => nativeNow() + 120_000);
      if (cleanupBy === "grant")
        await firstWriter.revokeByGrantId(grantId);
      else
        await createOidcProtocolObjectStore(testScope.writer, { keyPrefix: prefix }).revokeClient(clientId);
      const remaining = await testScope.observer.exists(longKey, shortKey, lookupKey, grantIndex, clientIndex);
      const after = await inventory.inspectClient(clientId);
      expect(remaining).toBe(0);
      expect(after.counts).toEqual({ total: 0, stale: 0, invalid: 0, byModel: {} });
    }
  });

  it("gives the Session UID lookup the same Redis deadline as its object under a lagging application clock", async () => {
    const testScope = scope!;
    const prefix = `${testScope.unique("session-clock")}:`;
    testScope.trackPrefix(prefix);
    const now = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => now() - 120_000);
    const adapter = createAdapter(testScope, "Session", { keyPrefix: prefix });
    await adapter.upsert("session", { uid: "uid", authorizations: { client: {} } }, 60);
    const result = await adapter.findByUid("uid");
    const deadlines = await Promise.all([
      `${prefix}oidc:model:Session:session`,
      `${prefix}oidc:session-uid:uid`,
      `${prefix}oidc:client-objects:client`,
    ].map(key => testScope.observer.pexpiretime(key)));
    expect(result?.uid).toBe("uid");
    expect(deadlines[0]).toBeGreaterThan(0);
    expect(deadlines).toEqual([deadlines[0], deadlines[0], deadlines[0]]);
  });

  it("persists the Kernel credential identity and revokes that credential with its protocol mirror", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client");
    const providerSessionUid = testScope.unique("provider-session");
    const tokenId = testScope.unique("token");
    const credentialId = testScope.unique("kernel-credential");
    const tokenKey = `oidc:model:AccessToken:${tokenId}`;
    const consumedKey = `oidc:consumed:AccessToken:${tokenId}`;
    const currentClientIndex = `oidc:client-objects:${clientId}`;
    for (const key of [tokenKey, consumedKey, currentClientIndex])
      testScope.trackKey(key);
    const registrations: Parameters<AdapterOidcSessionKernel["registerAccessTokenCredential"]>[0][] = [];
    const revoked: string[] = [];
    const adapter = createAdapter(testScope, "AccessToken", {
      registerAccessTokenCredential: async (input) => {
        registrations.push(input);
        return { credentialId } as never;
      },
      revokeAccessTokenCredential: async id => void revoked.push(id),
    });

    await adapter.upsert(tokenId, {
      accountId: SUBJECT_IDENTIFIER,
      clientId,
      sessionUid: providerSessionUid,
    }, 60);

    const serialized = await testScope.observer.get(tokenKey);
    const membership = await testScope.observer.zscore(currentClientIndex, tokenKey);
    expect(registrations).toEqual([expect.objectContaining({ providerTokenId: tokenId, providerTokenKey: tokenKey })]);
    expect(JSON.parse(serialized ?? "null")).toEqual({
      accountId: SUBJECT_IDENTIFIER,
      clientId,
      sessionUid: providerSessionUid,
      oidcConfigVersion: 3,
      oidcConfigVersions: { [clientId]: 3 },
      kernelCredentialId: credentialId,
      extra: { kernelCredentialId: credentialId },
    });
    expect(membership).not.toBeNull();

    await adapter.destroy(tokenId);

    const remainingPayloads = await testScope.observer.exists(tokenKey, consumedKey);
    expect(revoked).toEqual([credentialId]);
    expect(remainingPayloads).toBe(0);
  });

  it("does not persist protocol payload or owner indexes when Kernel registration is rejected", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client");
    const tokenId = testScope.unique("token");
    const grantId = testScope.unique("grant");
    const keys = [
      `oidc:model:AccessToken:${tokenId}`,
      `oidc:client-objects:${clientId}`,
      `oidc:grant-objects:${grantId}`,
    ];
    keys.forEach(key => testScope.trackKey(key));
    let registrationCalls = 0;
    const adapter = createAdapter(testScope, "AccessToken", {
      registerAccessTokenCredential: async () => {
        registrationCalls += 1;
        return null;
      },
    });
    const failure = await adapter.upsert(tokenId, {
      accountId: SUBJECT_IDENTIFIER,
      clientId,
      grantId,
      sessionUid: testScope.unique("provider-session"),
    }, 60).catch(error => error);
    const persistedKeys = await testScope.observer.exists(...keys);

    expect(failure).toEqual(new Error("OIDC access token Kernel credential registration failed"));
    expect(registrationCalls).toBe(1);
    expect(persistedKeys).toBe(0);
  });

  it("rejects a protocol mirror whose credential identity differs from the Kernel lookup", async () => {
    const testScope = scope!;
    const tokenId = testScope.unique("token");
    const tokenKey = `oidc:model:AccessToken:${tokenId}`;
    testScope.trackKey(tokenKey);
    const payload = { kernelCredentialId: "other-credential", extra: { kernelCredentialId: "other-credential" } };
    await testScope.writer.set(tokenKey, JSON.stringify(payload), "EX", 60);
    const adapter = createAdapter(testScope, "AccessToken", {
      resolveAccessTokenCredential: () => ({
        credential: { credentialId: "kernel-credential" },
        metadata: { providerTokenKey: tokenKey, providerTokenId: tokenId, oidcConfigVersion: 3 },
      }),
    });

    const result = await adapter.find(tokenId);

    expect(result).toBeUndefined();
  });

  it("reads the distinct payload key selected by the Kernel lookup", async () => {
    const testScope = scope!;
    const tokenId = testScope.unique("token");
    const defaultKey = `oidc:model:AccessToken:${tokenId}`;
    const selectedKey = `oidc:model:AccessToken:${testScope.unique("selected-payload")}`;
    for (const key of [defaultKey, selectedKey])
      testScope.trackKey(key);
    const selectedPayload = { kernelCredentialId: "kernel-credential", scope: "openid profile" };
    await testScope.writer.set(defaultKey, JSON.stringify({ ...selectedPayload, scope: "openid" }), "EX", 60);
    await testScope.writer.set(selectedKey, JSON.stringify(selectedPayload), "EX", 60);
    const adapter = createAdapter(testScope, "AccessToken", {
      resolveAccessTokenCredential: () => ({
        credential: { credentialId: "kernel-credential" },
        metadata: { providerTokenKey: selectedKey, providerTokenId: tokenId, oidcConfigVersion: 3 },
      }),
    });

    const result = await adapter.find(tokenId);

    expect(result).toEqual({ ...selectedPayload, redisLifetimeObserved: true });
  });

  it("removes an access token provider payload during grant cleanup", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client");
    const grantId = testScope.unique("grant");
    const tokenId = testScope.unique("token");
    const tokenKey = `oidc:model:AccessToken:${tokenId}`;
    const grantIndex = `oidc:grant-objects:${grantId}`;
    const clientIndex = `oidc:client-objects:${clientId}`;
    for (const key of [tokenKey, `oidc:consumed:AccessToken:${tokenId}`, grantIndex, clientIndex])
      testScope.trackKey(key);
    const adapter = createAdapter(testScope, "AccessToken");
    await adapter.upsert(tokenId, {
      accountId: SUBJECT_IDENTIFIER,
      clientId,
      grantId,
      sessionUid: testScope.unique("provider-session"),
    }, 60);

    await adapter.revokeByGrantId(grantId);

    expect(await testScope.observer.exists(tokenKey)).toBe(0);
  });

  it("removes only the invalidated client's provider protocol objects", async () => {
    const testScope = scope!;
    const clientA = testScope.unique("client-a");
    const clientB = testScope.unique("client-b");
    const tokenA = testScope.unique("token-a");
    const tokenB = testScope.unique("token-b");
    const interactionA = testScope.unique("interaction-a");
    const interactionB = testScope.unique("interaction-b");
    const sessionA = testScope.unique("session-a");
    const providerSessionUidA = testScope.unique("provider-session-a");
    const userCodeA = testScope.unique("user-code-a");
    const grantA = testScope.unique("grant-a");
    const modelKeys = [
      `oidc:model:AccessToken:${tokenA}`,
      `oidc:model:AccessToken:${tokenB}`,
      `oidc:model:Interaction:${interactionA}`,
      `oidc:model:Interaction:${interactionB}`,
      `oidc:model:Session:${sessionA}`,
    ];
    for (const key of [
      ...modelKeys,
      ...modelKeys.map(key => key.replace("oidc:model:", "oidc:consumed:")),
      `oidc:client-objects:${clientA}`,
      `oidc:client-objects:${clientB}`,
      `oidc:grant-objects:${grantA}`,
      `oidc:session-uid:${providerSessionUidA}`,
      `oidc:user-code:${userCodeA}`,
    ]) {
      testScope.trackKey(key);
    }
    const accessTokens = createAdapter(testScope, "AccessToken");
    const interactions = createAdapter(testScope, "Interaction");
    const sessions = createAdapter(testScope, "Session");
    await accessTokens.upsert(tokenA, {
      accountId: SUBJECT_IDENTIFIER,
      clientId: clientA,
      grantId: grantA,
      sessionUid: testScope.unique("provider-session-a"),
    }, 60);
    await accessTokens.upsert(tokenB, {
      accountId: SUBJECT_IDENTIFIER,
      clientId: clientB,
      sessionUid: testScope.unique("provider-session-b"),
    }, 60);
    await interactions.upsert(interactionA, {
      params: { client_id: clientA },
      userCode: userCodeA,
    }, 60);
    await interactions.upsert(interactionB, { params: { client_id: clientB } }, 60);
    await sessions.upsert(sessionA, {
      accountId: SUBJECT_IDENTIFIER,
      authorizations: { [clientA]: {} },
      uid: providerSessionUidA,
    }, 60);

    const protocolObjects = createOidcProtocolObjectStore(
      testScope.writer,
    );
    await expect(protocolObjects.inspectClient(clientA)).resolves.toEqual({
      clientId: clientA,
      counts: {
        total: 3,
        invalid: 0,
        stale: 0,
        byModel: {
          AccessToken: 1,
          Interaction: 1,
          Session: 1,
        },
      },
    });
    expect(await testScope.observer.exists(...modelKeys)).toBe(5);
    await protocolObjects.revokeClient(clientA);

    await expect(protocolObjects.inspectClient(clientA)).resolves.toEqual({
      clientId: clientA,
      counts: { total: 0, invalid: 0, stale: 0, byModel: {} },
    });
    expect(await testScope.observer.exists(modelKeys[0]!, modelKeys[2]!, modelKeys[4]!)).toBe(0);
    expect(await testScope.observer.exists(modelKeys[1]!, modelKeys[3]!)).toBe(2);
    expect(await testScope.observer.exists(
      `oidc:grant-objects:${grantA}`,
      `oidc:session-uid:${providerSessionUidA}`,
      `oidc:user-code:${userCodeA}`,
    )).toBe(0);
  });

  it("keeps the client owner index until its longest-lived object expires", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client");
    const indexKey = `oidc:client-objects:${clientId}`;
    testScope.trackKey(indexKey);
    const interactions = createAdapter(testScope, "Interaction");
    const longId = testScope.unique("long");
    const shortId = testScope.unique("short");
    const longKey = `oidc:model:Interaction:${longId}`;
    const shortKey = `oidc:model:Interaction:${shortId}`;
    testScope.trackKey(longKey);
    testScope.trackKey(shortKey);

    await interactions.upsert(longId, { params: { client_id: clientId } }, 120);
    await interactions.upsert(shortId, { params: { client_id: clientId } }, 1);

    const timeout = performance.now() + 3_000;
    while (await testScope.observer.exists(shortKey)) {
      if (performance.now() >= timeout)
        throw new Error("short OIDC object did not expire within its bounded observation");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const remainingTtl = await testScope.observer.pttl(indexKey);
    const store = createOidcProtocolObjectStore(testScope.observer);
    const inventory = await store.inspectClient(clientId);
    expect(remainingTtl).toBeGreaterThan(100_000);
    expect(inventory.counts).toEqual({ total: 2, stale: 1, invalid: 0, byModel: { Interaction: 1 } });
    await createOidcProtocolObjectStore(testScope.writer).revokeClient(clientId);
    const remaining = await testScope.observer.exists(longKey, shortKey, indexKey);
    const after = await store.inspectClient(clientId);
    expect(remaining).toBe(0);
    expect(after.counts.total).toBe(0);
  });

  it("reports and removes a dangling client owner member without hiding it during verify", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client-dangling");
    const indexKey = `oidc:client-objects:${clientId}`;
    const missingKey = `oidc:model:Interaction:${testScope.unique("missing")}`;
    testScope.trackKey(indexKey);
    await testScope.writer.zadd(indexKey, Date.now() + 60_000, missingKey);

    const protocolObjects = createOidcProtocolObjectStore(
      testScope.writer,
    );
    await expect(protocolObjects.inspectClient(clientId)).resolves.toMatchObject({
      counts: { invalid: 0, stale: 1, total: 1 },
    });

    await protocolObjects.revokeClient(clientId);

    await expect(protocolObjects.inspectClient(clientId)).resolves.toMatchObject({
      counts: { invalid: 0, stale: 0, total: 0 },
    });
    expect(await testScope.observer.zcard(indexKey)).toBe(0);
  });

  it("does not erase a concurrently replaced protocol object from its owner index", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client-concurrent");
    const objectKey = `oidc:model:Interaction:${testScope.unique("interaction")}`;
    const indexKey = `oidc:client-objects:${clientId}`;
    const initialPayload = JSON.stringify({ clientId, nonce: "initial" });
    const replacementPayload = JSON.stringify({ clientId, nonce: "replacement" });
    testScope.trackKey(objectKey);
    testScope.trackKey(indexKey);
    await testScope.writer.set(objectKey, initialPayload, "PX", 60_000);
    await testScope.writer.zadd(indexKey, Date.now() + 60_000, objectKey);

    let replaceBeforeDelete = true;
    const concurrentRedis = new Proxy(testScope.writer, {
      get(target, property) {
        if (property === "eval") {
          return async (script: string, keyCount: number, ...args: Array<string | number>) => {
            if (
              replaceBeforeDelete
              && script.includes("delete_indexed_protocol_object_if_unchanged")
            ) {
              replaceBeforeDelete = false;
              await target.set(objectKey, replacementPayload, "PX", 60_000);
              await target.zadd(indexKey, Date.now() + 60_000, objectKey);
            }
            return await target.eval(script, keyCount, ...args);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Redis;
    const protocolObjects = createOidcProtocolObjectStore(
      concurrentRedis,
    );

    await protocolObjects.revokeClient(clientId);

    expect(await testScope.observer.get(objectKey)).toBe(replacementPayload);
    await expect(protocolObjects.inspectClient(clientId)).resolves.toMatchObject({
      counts: { invalid: 0, stale: 0, total: 1 },
    });
  });

  it("removes every Session key when the artifact still owns its UID", async () => {
    const testScope = scope!;
    const providerSessionUid = testScope.unique("provider-session");
    const sessionId = testScope.unique("session");
    const artifactKey = `oidc:model:Session:${sessionId}`;
    const consumedKey = `oidc:consumed:Session:${sessionId}`;
    const reverseKey = `oidc:session-uid:${providerSessionUid}`;
    testScope.trackKey(artifactKey);
    testScope.trackKey(consumedKey);
    testScope.trackKey(reverseKey);
    const adapter = createAdapter(testScope);
    await adapter.upsert(sessionId, {
      kernelPrincipalSessionId: "principal-current",
      providerSessionAnchorGeneration: "generation-current",
      uid: providerSessionUid,
    }, 60);
    await adapter.consume(sessionId);
    expect(await Promise.all([
      testScope.observer.exists(artifactKey),
      testScope.observer.exists(consumedKey),
      testScope.observer.exists(reverseKey),
    ])).toEqual([1, 1, 1]);

    await adapter.destroy(sessionId);

    await expect(adapter.findByUid(providerSessionUid)).resolves.toBeUndefined();
    expect(await Promise.all([
      testScope.observer.exists(artifactKey),
      testScope.observer.exists(consumedKey),
      testScope.observer.exists(reverseKey),
    ])).toEqual([0, 0, 0]);
  });

  it("keeps real protocol expirations during Maintenance and rejects old versions after rotation", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client");
    const providerSessionUid = testScope.unique("provider-session");
    const version = { value: 3 };
    const artifacts = [
      {
        adapter: createAdapter(testScope, "Interaction", { version }),
        id: testScope.unique("interaction"),
        model: "Interaction",
        payload: { params: { client_id: clientId } },
        ttlSeconds: 600,
      },
      {
        adapter: createAdapter(testScope, "Grant", { version }),
        id: testScope.unique("grant"),
        model: "Grant",
        payload: { accountId: SUBJECT_IDENTIFIER, clientId },
        ttlSeconds: 700,
      },
      {
        adapter: createAdapter(testScope, "AccessToken", {
          resolveAccessTokenCredential: tokenId => ({
            credential: {
              clientCode: clientId,
              credentialId: `${tokenId}-credential`,
              principalSessionId: "principal-a",
            },
            metadata: {
              oidcConfigVersion: 3,
              providerTokenId: tokenId,
              providerTokenKey: `oidc:model:AccessToken:${tokenId}`,
            },
          } as never),
          version,
        }),
        id: testScope.unique("access-token"),
        model: "AccessToken",
        payload: {
          accountId: SUBJECT_IDENTIFIER,
          clientId,
          sessionUid: testScope.unique("provider-session-access"),
        },
        ttlSeconds: 800,
      },
      {
        adapter: createAdapter(testScope, "Session", { version }),
        id: testScope.unique("session"),
        model: "Session",
        payload: {
          accountId: SUBJECT_IDENTIFIER,
          authorizations: { [clientId]: {} },
          uid: providerSessionUid,
        },
        ttlSeconds: 900,
      },
    ];
    const keys = artifacts.map(artifact => `oidc:model:${artifact.model}:${artifact.id}`);
    for (const key of [
      ...keys,
      ...keys.map(key => key.replace("oidc:model:", "oidc:consumed:")),
      `oidc:client-objects:${clientId}`,
      `oidc:session-uid:${providerSessionUid}`,
    ]) {
      testScope.trackKey(key);
    }
    for (const artifact of artifacts)
      await artifact.adapter.upsert(artifact.id, artifact.payload, artifact.ttlSeconds);
    const originalExpiresAt = await readAbsoluteExpirations(testScope, keys);
    const maintenanceGate = createOidcClientTrafficGate({
      gate: { check: async () => ({ outcome: "maintenance" }) },
    });

    await expect(maintenanceGate.assertIssuanceAllowed(clientId)).rejects.toMatchObject({
      error: "temporarily_unavailable",
    });

    const afterMaintenanceExpiresAt = await readAbsoluteExpirations(testScope, keys);
    for (let index = 0; index < keys.length; index += 1)
      expect(Math.abs(afterMaintenanceExpiresAt[index]! - originalExpiresAt[index]!)).toBeLessThan(100);

    version.value = 4;
    for (const artifact of artifacts) {
      const resolved = await artifact.adapter.find(artifact.id);
      expect(resolved).toBeUndefined();
    }
    const remaining = await testScope.observer.exists(...keys);
    expect(remaining).toBe(0);
  });

  it("preserves a newer Session owner when an old artifact is destroyed late", async () => {
    const testScope = scope!;
    const providerSessionUid = testScope.unique("provider-session");
    const oldSessionId = testScope.unique("session-old");
    const newSessionId = testScope.unique("session-new");
    const oldArtifactKey = `oidc:model:Session:${oldSessionId}`;
    const newArtifactKey = `oidc:model:Session:${newSessionId}`;
    const reverseKey = `oidc:session-uid:${providerSessionUid}`;
    testScope.trackKey(oldArtifactKey);
    testScope.trackKey(newArtifactKey);
    testScope.trackKey(`oidc:consumed:Session:${oldSessionId}`);
    testScope.trackKey(`oidc:consumed:Session:${newSessionId}`);
    testScope.trackKey(reverseKey);
    const adapter = createAdapter(testScope);
    await adapter.upsert(oldSessionId, {
      kernelPrincipalSessionId: "principal-old",
      providerSessionAnchorGeneration: "generation-old",
      uid: providerSessionUid,
    }, 60);
    await adapter.upsert(newSessionId, {
      kernelPrincipalSessionId: "principal-new",
      providerSessionAnchorGeneration: "generation-new",
      uid: providerSessionUid,
    }, 60);
    expect(await testScope.observer.get(reverseKey)).toBe(newSessionId);

    await adapter.destroy(oldSessionId);

    await expect(adapter.findByUid(providerSessionUid)).resolves.toMatchObject({
      kernelPrincipalSessionId: "principal-new",
      providerSessionAnchorGeneration: "generation-new",
    });
    expect(await testScope.observer.get(reverseKey)).toBe(newSessionId);
    expect(await testScope.observer.exists(oldArtifactKey)).toBe(0);
    expect(await testScope.observer.exists(newArtifactKey)).toBe(1);
  });
});

async function readAbsoluteExpirations(
  testScope: OidcProviderRedisTestScope,
  keys: string[],
) {
  return await Promise.all(keys.map(async key => Date.now() + await testScope.observer.pttl(key)));
}

function createAdapter(
  testScope: OidcProviderRedisTestScope,
  model = "Session",
  options: {
    registerAccessTokenCredential?: AdapterOidcSessionKernel["registerAccessTokenCredential"];
    revokeAccessTokenCredential?: AdapterOidcSessionKernel["revokeAccessTokenCredential"];
    resolveAccessTokenCredential?: (tokenId: string) => unknown;
    version?: { value: number | null };
    keyPrefix?: string;
    redis?: Redis;
  } = {},
) {
  const version = options.version ?? { value: 3 };
  return new RedisOidcAdapter(model, options.redis ?? testScope.writer, {
    claims: {
      createAuthorizationCodeSnapshot: async (input: CreateOidcAuthorizationCodeSnapshotInput) => ({
        version: 1,
        ...input,
        claims: { sub: input.subjectIdentifier },
      }),
    },
    clientVersions: {
      findActiveVersion: async () => version.value,
    },
    oidcSession: {
      registerAuthorizationCodeArtifact: async () => true,
      resolveAuthorizationCodeSessionLifetime: async (_id: string, serializedProviderCode: string) => ({ serializedProviderCode, remainingSeconds: 90, artifact: { version: 1 as const, artifactId: "code", protocol: "oidc", artifactType: "authorization_code", lookupHash: "lookup", issuedAt: 0, expiresAt: 60000, cleanupRefs: [] } }),
      consumeAuthorizationCodeArtifact: async () => null,
      registerAccessTokenCredential: options.registerAccessTokenCredential
        ?? (async input => ({ credentialId: `${input.providerTokenId}-credential` }) as never),
      resolveAccessTokenCredential: async tokenId => options.resolveAccessTokenCredential?.(tokenId) as never ?? null,
      revokeAccessTokenCredential: options.revokeAccessTokenCredential ?? (async () => undefined),
    },
    providerSessions: {
      consumeStaged: async () => null,
      destroyProviderSession: async () => true,
      ensureClientBinding: async () => null,
      readForAuthorization: async (_sessionUid, clientCode) => ({
        accountId: SUBJECT_IDENTIFIER,
        authTime: 1_782_260_000,
        bindingId: `${clientCode}-binding`,
        clientCode,
        expiresAt: 1_782_263_600,
        oidcConfigVersion: 3,
        principalSessionId: "principal-a",
      }),
      readPrincipalAnchor: async () => null,
    },
    tokens: createOidcTokenStore(testScope.writer),
  }, options.keyPrefix);
}
