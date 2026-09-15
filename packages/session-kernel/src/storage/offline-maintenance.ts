import type {
  UnifiedSessionInventoryInput,
  UnifiedSessionInventoryRedis,
  UnifiedSessionMaintenanceRedis,
} from "../unified-maintenance";
import type { MaintenanceScanRedis } from "./maintenance-scan";
import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  ClientBindingSchema,
  IssuedCredentialSchema,
  PrincipalSessionSchema,
  ProtocolArtifactSchema,
  RevokedTombstoneSchema,
} from "../state/model";
import { createSessionKernelKeyBuilder, parseIndexMember, sessionKernelMaintenancePrefixes } from "./keys";
import { createMaintenanceVerifier } from "./maintenance-scan";

const kinds = { p: "principal_session", b: "client_binding", c: "credential", a: "artifact" } as const;
const schemas = {
  p: PrincipalSessionSchema,
  b: ClientBindingSchema.strict(),
  c: IssuedCredentialSchema.strict(),
  a: ProtocolArtifactSchema.strict(),
};
const opaque = z.string().regex(/^[\w-]{1,512}$/u);
const removeObserved = `
local kind=redis.call('TYPE',KEYS[1]).ok
if kind~=ARGV[1] then return 0 end
if kind=='string' then
  if redis.call('GET',KEYS[1])~=ARGV[2] then return 0 end
else
  local expected=cjson.decode(ARGV[2])
  local actual=redis.call('ZRANGE',KEYS[1],0,ARGV[3]=='partial' and 999 or 1000,'WITHSCORES')
  if #actual~=#expected then return 0 end
  for i=1,#actual do if actual[i]~=expected[i] then return 0 end end
  if ARGV[3]=='partial' then
    for i=1,#expected,2 do redis.call('ZREM',KEYS[1],expected[i]) end
    return 2
  end
end
return redis.call('DEL',KEYS[1])
`;

function decodeString(suffix: string, raw: string) {
  const match = /^(active|lookup|revoked|revoked_lookup|state|id):([pbca]):([\w-]+)$/u.exec(suffix);
  if (!match)
    throw new Error("Unknown legacy Kernel family");
  const [, family, code, identity] = match;
  const kind = z.enum(["p", "b", "c", "a"]).parse(code);
  opaque.parse(identity);
  if (family === "state" && !/^[a-f0-9]{64}$/u.test(identity!))
    throw new Error("Unknown direct state digest");
  if ((family === "lookup" || family === "id") && kind !== "b") {
    opaque.parse(raw);
    if (family === "id" && !/^[a-f0-9]{64}$/u.test(raw))
      throw new Error("Unknown legacy reverse digest");
    return;
  }
  const value: unknown = JSON.parse(raw);
  const terminal
    = family === "revoked"
      || family === "revoked_lookup"
      || (family === "state" && value !== null && typeof value === "object" && "state" in value);
  if (terminal) {
    const record
      = family === "state"
        ? RevokedTombstoneSchema.extend({ state: z.literal("revoked") })
            .strict()
            .parse(value)
        : RevokedTombstoneSchema.strict().parse(value);
    if (
      record.objectKind !== kinds[kind]
      || (family === "revoked" ? record.objectId !== identity : record.lookupHash !== identity)
    ) {
      throw new Error("Legacy terminal identity mismatch");
    }
  }
  else if (family === "active" || (family === "state" && kind !== "b")) {
    const record = schemas[kind].parse(value);
    const recordId
      = "principalSessionId" in record && kind === "p"
        ? record.principalSessionId
        : "bindingId" in record && kind === "b"
          ? record.bindingId
          : "credentialId" in record
            ? record.credentialId
            : "artifactId" in record
              ? record.artifactId
              : null;
    const hash
      = "externalTokenLookupHash" in record
        ? record.externalTokenLookupHash
        : "lookupHash" in record
          ? record.lookupHash
          : null;
    if ((family === "active" ? recordId : hash) !== identity)
      throw new Error("Legacy session identity mismatch");
  }
  else {
    throw new Error("Unknown legacy state");
  }
}

function decodeIndex(suffix: string, members: string[]) {
  const parts = suffix.split(":");
  const counts: Record<string, number> = {
    principal_cleanup: 2,
    principal_sessions: 2,
    user: 5,
    client: 3,
    client_protocol: 4,
    client_protocol_cleanup: 4,
    principal: 3,
    binding: 3,
    protocol: 3,
  };
  if (
    parts[0] !== "idx"
    || counts[parts[1]!] !== parts.length
    || (parts[1] === "user" && parts[4] !== "principal")
    || parts.slice(2).some(part => !part || encodeURIComponent(decodeURIComponent(part)) !== part)
    || members.length > 2000
    || members.length % 2
  ) {
    throw new Error("Unknown legacy index");
  }
  for (let i = 0; i < members.length; i += 2) {
    const member = parseIndexMember(members[i]!);
    if (!member)
      throw new Error("Unknown legacy index member");
    opaque.parse(member.id);
    z.number()
      .nonnegative()
      .finite()
      .parse(Number(members[i + 1]));
  }
}

function createInventory(redis: UnifiedSessionInventoryRedis, namespace: string) {
  z.string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace);
  const prefix = createSessionKernelKeyBuilder(namespace).namespace;
  const families = sessionKernelMaintenancePrefixes(namespace);
  async function inspect(input: UnifiedSessionInventoryInput = {}) {
    const cursor
      = !input.cursor || input.cursor === "0"
        ? { scan: "0", pending: [] as string[] }
        : z
            .object({ scan: z.string().regex(/^\d+$/u), pending: z.array(z.string()) })
            .strict()
            .parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
    const limit = z
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(input.limit ?? 100);
    const [scan, found] = cursor.pending.length
      ? ([cursor.scan, cursor.pending] as const)
      : await redis.scan(cursor.scan, "MATCH", `${prefix}*`, "COUNT", String(limit));
    if (!/^\d+$/u.test(scan) || found.some(key => !key.startsWith(prefix)))
      throw new Error("Legacy Kernel inventory unavailable");
    const pending = found.slice(limit);
    const nextCursor
      = scan === "0" && !pending.length
        ? "0"
        : Buffer.from(JSON.stringify({ scan, pending })).toString("base64url");
    const records: Array<{ key: string; kind: string; raw: string; partial?: boolean }> = [];
    let unknown = 0;
    for (const key of found.slice(0, limit)) {
      if (!families.some(family => key.startsWith(family)))
        continue;
      try {
        const kind = await redis.type(key);
        if (kind === "none")
          continue;
        if (kind === "string") {
          const raw = await redis.get(key);
          if (raw === null)
            continue;
          decodeString(key.slice(prefix.length), raw);
          records.push({ key, kind, raw });
        }
        else if (kind === "zset") {
          const found = await redis.zrange(key, 0, 1000, "WITHSCORES");
          const partial = found.length > 2000;
          const members = found.slice(0, 2000);
          decodeIndex(key.slice(prefix.length), members);
          records.push({ key, kind, raw: JSON.stringify(members), partial });
        }
        else {
          throw new Error("Unknown legacy storage type");
        }
      }
      catch {
        unknown++;
      }
    }
    return { nextCursor, records, unknown };
  }
  return {
    inspect,
    async inventory(input: UnifiedSessionInventoryInput = {}) {
      const page = await inspect(input);
      return {
        nextCursor: page.nextCursor,
        matching: page.records.length,
        unknown: page.unknown + page.records.filter(record => record.partial).length,
      };
    },
  };
}

/** Explicit offline source decoder. No online factory imports or probes this layout. */
export function createOfflineSessionInventory(redis: UnifiedSessionInventoryRedis, namespace: string) {
  return { inventory: createInventory(redis, namespace).inventory };
}

export function createOfflineSessionVerifier(redis: MaintenanceScanRedis, namespace: string) {
  z.string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace);
  return createMaintenanceVerifier(
    redis,
    sessionKernelMaintenancePrefixes(namespace).map(prefix => `${prefix}*`),
  );
}

export function createOfflineSessionMaintenance(redis: UnifiedSessionMaintenanceRedis, namespace: string) {
  const inventory = createInventory(redis, namespace);
  return {
    inventory: inventory.inventory,
    async apply(input: UnifiedSessionInventoryInput = {}) {
      const page = await inventory.inspect(input);
      let removed = 0;
      let changed = 0;
      let unknown = page.unknown;
      for (const record of page.records) {
        try {
          const result = await redis.eval(
            removeObserved,
            1,
            record.key,
            record.kind,
            record.raw,
            record.partial ? "partial" : "complete",
          );
          if (result === 1)
            removed++;
          else if (result === 0)
            changed++;
          else unknown++;
        }
        catch {
          unknown++;
        }
      }
      return { nextCursor: page.nextCursor, removed, changed, unknown };
    },
  };
}
