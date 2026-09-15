import { Buffer } from "node:buffer";
import { z } from "zod";
import { OidcStateUnavailableError } from "./errors";
import { logoutRecordSchema } from "./logout-state";
import { codeDigest, codeRecordSchema, continuationSchema, statePrefix } from "./state";
import { tokenRecordSchema } from "./token-state";

export interface OidcInventoryRedis {
  scan: (
    cursor: string,
    match: "MATCH",
    pattern: string,
    count: "COUNT",
    limit: string,
  ) => Promise<[string, string[]]>;
  get: (key: string) => Promise<string | null>;
}
export interface OidcMaintenanceRedis extends OidcInventoryRedis {
  eval: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
}
export interface OidcInventoryInput {
  cursor?: string;
  limit?: number;
  clientId?: string;
}

export function createOidcVerifier(redis: Pick<OidcInventoryRedis, "scan">, namespace: string) {
  const prefix = statePrefix(namespace);
  return {
    async verify(signal?: AbortSignal) {
      let cursor = "0";
      let matching = 0;
      do {
        signal?.throwIfAborted();
        const page = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", "100");
        if (
          !Array.isArray(page)
          || page.length !== 2
          || !/^\d+$/u.test(page[0])
          || !Array.isArray(page[1])
          || page[1].some(key => !key.startsWith(prefix))
        ) {
          throw new OidcStateUnavailableError();
        }
        cursor = page[0];
        matching += page[1].length;
      } while (cursor !== "0");
      return { matching };
    },
  };
}

function createInventory(redis: OidcInventoryRedis, namespace: string) {
  const prefix = statePrefix(namespace);
  async function inspect(input: OidcInventoryInput = {}) {
    const cursorSchema = z
      .object({ scan: z.string().regex(/^\d+$/u), pending: z.array(z.string()) })
      .strict();
    const cursor
      = !input.cursor || input.cursor === "0"
        ? { scan: "0", pending: [] as string[] }
        : cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
    const limit = z
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(input.limit ?? 100);
    const [scan, found] = cursor.pending.length
      ? ([cursor.scan, cursor.pending] as const)
      : await redis.scan(cursor.scan, "MATCH", `${prefix}*`, "COUNT", String(limit));
    if (found.some(key => !key.startsWith(prefix)))
      throw new OidcStateUnavailableError();
    const pending = found.slice(limit);
    const nextCursor
      = scan === "0" && !pending.length
        ? "0"
        : Buffer.from(JSON.stringify({ scan, pending })).toString("base64url");
    const records: Array<{
      key: string;
      raw: string;
      reverseKey?: string;
      digest?: string;
      orphanTarget?: string;
    }> = [];
    let unknown = 0;
    for (const key of found.slice(0, limit)) {
      const raw = await redis.get(key);
      if (raw === null)
        continue;
      try {
        let clientId: string | null;
        let reverseKey: string | undefined;
        let digest: string | undefined;
        if (key.startsWith(`${prefix}code:`)) {
          const value = codeRecordSchema.parse(JSON.parse(raw));
          if (value.expiresAt <= value.issuedAt)
            throw new Error("Invalid Code lifetime");
          if (key !== `${prefix}code:${codeDigest(value.clientId, value)}`)
            throw new Error("Code identity mismatch");
          clientId = value.clientId;
        }
        else if (
          key.startsWith(`${prefix}continuation:`)
          && /^[a-f0-9]{64}$/u.test(key.slice(`${prefix}continuation:`.length))
        ) {
          clientId = continuationSchema.parse(JSON.parse(raw)).authorization.clientId;
        }
        else if (
          key.startsWith(`${prefix}logout:`)
          && /^[a-f0-9]{64}$/u.test(key.slice(`${prefix}logout:`.length))
        ) {
          clientId = logoutRecordSchema.parse(JSON.parse(raw)).clientId;
        }
        else if (key.startsWith(`${prefix}token:`)) {
          const value = tokenRecordSchema.parse(JSON.parse(raw));
          if (value.expiresAt <= value.issuedAt)
            throw new Error("Invalid Token lifetime");
          if (key !== `${prefix}token:${value.digest}`)
            throw new Error("Token identity mismatch");
          clientId = value.clientId;
          reverseKey = `${prefix}token-id:${value.id}`;
          digest = value.digest;
        }
        else if (key.startsWith(`${prefix}token-id:`)) {
          // A well-formed orphan is an independently owned index; only full scope may reclaim it.
          z.uuid().parse(key.slice(`${prefix}token-id:`.length));
          const token = /^[a-f0-9]{64}$/u.test(raw) ? await redis.get(`${prefix}token:${raw}`) : null;
          if (/^[a-f0-9]{64}$/u.test(raw) && token === null) {
            if (!input.clientId)
              records.push({ key, raw, orphanTarget: `${prefix}token:${raw}` });
            continue;
          }
          const value = tokenRecordSchema.safeParse(token ? JSON.parse(token) : null);
          if (!value.success || key !== `${prefix}token-id:${value.data.id}` || value.data.digest !== raw)
            throw new Error("Unknown reverse identity");
          continue;
        }
        else {
          throw new Error("Unknown owner record");
        }
        if (!input.clientId || input.clientId === clientId)
          records.push({ key, raw, reverseKey, digest });
      }
      catch {
        unknown++;
      }
    }
    return { nextCursor, records, unknown };
  }
  return {
    inspect,
    async inventory(input: OidcInventoryInput = {}) {
      try {
        const page = await inspect(input);
        return { nextCursor: page.nextCursor, matching: page.records.length, unknown: page.unknown };
      }
      catch {
        throw new OidcStateUnavailableError();
      }
    },
  };
}

/** Independent read-only inventory also serves verification, including records without TTL or indexes. */
export function createOidcInventory(redis: OidcInventoryRedis, namespace: string) {
  return { inventory: createInventory(redis, namespace).inventory };
}

export function createOidcMaintenance(redis: OidcMaintenanceRedis, namespace: string) {
  const inventory = createInventory(redis, namespace);
  return {
    inventory: inventory.inventory,
    async apply(input: OidcInventoryInput = {}) {
      const page = await inventory.inspect(input);
      let removed = 0;
      let changed = 0;
      let unknown = page.unknown;
      for (const record of page.records) {
        try {
          const result = record.orphanTarget
            ? await redis.eval(
                "if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('EXISTS',KEYS[2])>0 then return 0 end; return redis.call('DEL',KEYS[1])",
                2,
                record.key,
                record.orphanTarget,
                record.raw,
              )
            : record.reverseKey
              ? await redis.eval(
                  "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; redis.call('DEL',KEYS[1]); if redis.call('GET',KEYS[2])==ARGV[2] then redis.call('DEL',KEYS[2]) end; return 1",
                  2,
                  record.key,
                  record.reverseKey,
                  record.raw,
                  record.digest!,
                )
              : await redis.eval(
                  "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; return redis.call('DEL',KEYS[1])",
                  1,
                  record.key,
                  record.raw,
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
