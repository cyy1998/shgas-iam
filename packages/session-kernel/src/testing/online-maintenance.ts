import type Redis from "ioredis";
import { createHash, randomUUID } from "node:crypto";
import {
  ClientBindingSchema,
  IssuedCredentialSchema,
  PrincipalSessionSchema,
  ProtocolArtifactSchema,
} from "../state/model";
import { createSessionKernelKeyBuilder } from "../storage/keys";
import { createUnifiedSessionKernel } from "../unified/factory";

/** Test-only source/target inventory and controlled storage faults belong to the Kernel owner. */
export function createSessionMaintenanceTestFixture(
  redis: Redis,
  namespace: string,
  trackKey: (key: string) => void,
) {
  const legacy = createSessionKernelKeyBuilder(namespace);
  const prefix = `${namespace}:unified:v1:`;
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  function owned(key: string) {
    trackKey(key);
    return key;
  }
  async function put(key: string, value: unknown, ttl = false) {
    owned(key);
    await redis.set(key, typeof value === "string" ? value : JSON.stringify(value));
    if (ttl)
      await redis.pexpire(key, 120000);
    return key;
  }
  return {
    async seedUnified() {
      const kernel = createUnifiedSessionKernel({
        redis,
        namespace,
        userSessionTtlSeconds: 3600,
        clientSessionTtlSeconds: 1800,
        assertOperationActive: () => {},
      }).forOperation({});
      try {
        const root = await kernel.createUserSession({
          subjectIdentifier: randomUUID(),
          subjectContext: "sensitive-fixture",
          amr: ["pwd"],
        });
        const parent = await kernel.resolveUserSession(root.bearer);
        if (parent.status !== "resolved")
          throw new Error("Root fixture unavailable");
        await kernel.openClientSession(parent.value, { clientId: "alpha", protocol: "oidc" });
        const terminal = await kernel.createUserSession({
          subjectIdentifier: randomUUID(),
          subjectContext: "sensitive-fixture",
          amr: [],
        });
        await kernel.revokeObservedUserSession(terminal.observation);
        const keys = await redis.keys(`${prefix}*`);
        for (const key of keys) {
          if (key.includes(":inventory:") || key.includes(":children:"))
            await redis.del(key);
          else await redis.persist(key);
        }
        return await redis.keys(`${prefix}*`);
      }
      finally {
        (await redis.keys(`${prefix}*`)).forEach(owned);
      }
    },
    async seedCorruptUnified() {
      const malformed = await put(`${prefix}user:${hash(randomUUID())}`, "sensitive-fixture", true);
      const wrongType = owned(`${prefix}client:${randomUUID()}`);
      await redis.hset(wrongType, "secret", "sensitive-fixture");
      return [malformed, wrongType];
    },
    async seedSource() {
      // Frozen source layout, validated by the retired owner's codecs. This is not an online writer.
      // Actual writer provenance was verified at aeb2dc45 in #193; these are controlled offline fixtures.
      const now = Date.now();
      const expiresAt = now + 120000;
      const principalSessionId = randomUUID();
      const principal = { principalType: "user", subjectId: randomUUID() };
      const common = {
        version: 1,
        subjectContext: "sensitive-fixture",
        issuedAt: now,
        expiresAt,
        cleanupRefs: [],
      };
      const root = PrincipalSessionSchema.parse({
        version: 1,
        principalSessionId,
        externalTokenLookupHash: hash(principalSessionId),
        principal,
        subjectContext: common.subjectContext,
        authTime: now,
        lastActiveAt: now,
        expiresAt,
        absoluteExpiresAt: expiresAt,
      });
      const credentialId = randomUUID();
      const credential = IssuedCredentialSchema.parse({
        ...common,
        credentialId,
        lookupHash: hash(credentialId),
        principalSessionId,
        principal,
        clientCode: "alpha",
        protocol: "oidc",
        credentialType: "access_token",
        renewalPolicy: "fixed_at_issue",
      });
      const bindingId = randomUUID();
      const binding = ClientBindingSchema.parse({
        ...common,
        bindingId,
        principalSessionId,
        principal,
        clientCode: "alpha",
        protocol: "oidc",
        authTime: now,
        renewalPolicy: "extend_with_principal",
      });
      const artifactId = randomUUID();
      const artifact = ProtocolArtifactSchema.parse({
        ...common,
        artifactId,
        lookupHash: hash(artifactId),
        principalSessionId,
        principal,
        clientCode: "alpha",
        protocol: "oidc",
        artifactType: "authorization_code",
      });
      for (const [kind, original, idField, hashField] of [
        ["principal_session", root, "principalSessionId", "externalTokenLookupHash"],
        ["credential", credential, "credentialId", "lookupHash"],
        ["artifact", artifact, "artifactId", "lookupHash"],
      ] as const) {
        const id = randomUUID();
        const digest = hash(id);
        await put(legacy.active(kind, id), { ...original, [idField]: id, [hashField]: digest });
        await put(legacy.lookup(kind, digest), id);
        const terminalId = randomUUID();
        const terminalHash = hash(terminalId);
        const terminal = {
          version: 1,
          objectKind: kind,
          objectId: terminalId,
          lookupHash: terminalHash,
          reason: "logout",
          revokedAt: now,
          expiresAt,
          cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "sensitive-fixture" }],
        };
        await put(legacy.tombstone(kind, terminalId), terminal);
        await put(legacy.lookupTombstone(kind, terminalHash), terminal);
        await put(legacy.state(kind, terminalHash), { ...terminal, state: "revoked" });
        await put(legacy.identity(kind, terminalId), terminalHash);
        const directId = randomUUID();
        const directHash = hash(directId);
        await put(legacy.state(kind, directHash), {
          ...original,
          [idField]: directId,
          [hashField]: directHash,
        });
        await put(legacy.identity(kind, directId), directHash);
      }
      await put(legacy.active("client_binding", bindingId), binding);
      const index = owned(legacy.index.client("alpha"));
      await redis.zadd(index, expiresAt, `b:${bindingId}`);
      return await redis.keys(`${legacy.namespace}*`);
    },
    async seedCorruptSource() {
      return await put(legacy.state("principal_session", hash(randomUUID())), { version: 999 });
    },
    async seedOrphanSourceIdentity() {
      return await put(legacy.identity("credential", randomUUID()), hash(randomUUID()));
    },
    async seedLargeUnifiedIndex(count: number) {
      const key = owned(`${prefix}inventory:clientSession`);
      const members = Array.from({ length: count }, () => randomUUID());
      await redis.zadd(key, ...members.flatMap(member => [Date.now() + 120000, member]));
      return { count: async () => await redis.zcard(key) };
    },
  };
}
