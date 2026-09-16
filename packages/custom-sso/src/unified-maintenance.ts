import { Buffer } from "node:buffer";
import { z } from "zod";
import { createScanVerifier } from "./grant/scan-verifier";
import { codeRecordSchema, continuationSchema, CustomSsoStateUnavailableError } from "./unified/state";
import { tokenDigest, tokenRecordSchema } from "./unified/token-state";

export interface CustomSsoInventoryRedis {
  scan: (
    cursor: string,
    match: "MATCH",
    pattern: string,
    count: "COUNT",
    limit: string,
  ) => Promise<[string, string[]]>;
  get: (key: string) => Promise<string | null>;
}
export interface CustomSsoMaintenanceRedis extends CustomSsoInventoryRedis {
  eval: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
}
export interface CustomSsoInventoryInput {
  cursor?: string;
  limit?: number;
  clientCode?: string;
  /** Authorization invalidation preserves Tokens and every reverse index, including orphans. */
  artifacts?: "all" | "authorization";
}

export function createUnifiedCustomSsoVerifier(
  redis: Pick<CustomSsoInventoryRedis, "scan">,
  namespace: string,
) {
  return createScanVerifier(
    redis,
    `${z
      .string()
      .regex(/^[\w:-]+$/u)
      .parse(namespace)}:custom-sso:v1:`,
  );
}

/** Inventory is bounded and read-only; an independent connection can verify the same scope. */
function createInventory(redis: CustomSsoInventoryRedis, namespace: string) {
  const prefix = `${z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace)}:custom-sso:v1:`;
  async function inspect(input: CustomSsoInventoryInput = {}) {
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
      throw new Error("Inventory cursor is outside owner namespace");
    const keys = found.slice(0, limit);
    const pending = found.slice(limit);
    const nextCursor
      = scan === "0" && pending.length === 0
        ? "0"
        : Buffer.from(JSON.stringify({ scan, pending }), "utf8").toString("base64url");
    const records: Array<{
      key: string;
      raw: string;
      reverseKey?: string;
      digest?: string;
      orphanTarget?: string;
    }> = [];
    let unknown = 0;
    for (const key of keys) {
      if (input.artifacts === "authorization"
        && (key.startsWith(`${prefix}token:`) || key.startsWith(`${prefix}token-id:`))) {
        continue;
      }
      const raw = await redis.get(key);
      if (raw === null)
        continue;
      try {
        if (key.startsWith(`${prefix}code:`)) {
          const value = codeRecordSchema.parse(JSON.parse(raw));
          if (value.expiresAt <= value.issuedAt)
            throw new Error("Invalid Code lifetime");
          const expected = tokenDigest(
            JSON.stringify([value.clientCode, value.userSessionId, value.clientSessionId, value.codeId]),
          );
          if (key !== `${prefix}code:${expected}`)
            throw new Error("Code identity mismatch");
          if (!input.clientCode || value.clientCode === input.clientCode)
            records.push({ key, raw });
        }
        else if (key.startsWith(`${prefix}token:`)) {
          const value = tokenRecordSchema.parse(JSON.parse(raw));
          if (value.expiresAt <= value.issuedAt)
            throw new Error("Invalid Token lifetime");
          const digest = key.slice(`${prefix}token:`.length);
          if (!/^[a-f0-9]{64}$/u.test(digest))
            throw new Error("Token identity malformed");
          if (!input.clientCode || value.clientCode === input.clientCode)
            records.push({ key, raw, digest, reverseKey: `${prefix}token-id:${value.tokenId}` });
        }
        else if (key.startsWith(`${prefix}token-id:`)) {
          // Reverse entries are not authority. Only global maintenance can classify an orphan.
          if (
            !z.uuid().safeParse(key.slice(`${prefix}token-id:`.length)).success
            || !/^[a-f0-9]{64}$/u.test(raw)
          ) {
            throw new Error("Token reverse identity malformed");
          }
          if (!input.clientCode && (await redis.get(`${prefix}token:${raw}`)) === null)
            records.push({ key, raw, orphanTarget: `${prefix}token:${raw}` });
        }
        else if (key.startsWith(`${prefix}continuation:`)) {
          const value = continuationSchema.parse(JSON.parse(raw));
          if (
            !/^[a-f0-9]{64}$/u.test(key.slice(`${prefix}continuation:`.length))
            || !/^[a-f0-9]{64}$/u.test(value.browserDigest)
            || !Number.isSafeInteger(value.expiresAt)
            || value.expiresAt <= 0
          ) {
            throw new Error("Continuation identity malformed");
          }
          if (!input.clientCode || value.clientCode === input.clientCode)
            records.push({ key, raw });
        }
        else {
          unknown++;
        }
      }
      catch {
        unknown++;
      }
    }
    return { nextCursor, records, unknown };
  }
  return {
    async inventory(input: CustomSsoInventoryInput = {}) {
      try {
        const page = await inspect(input);
        return { nextCursor: page.nextCursor, matching: page.records.length, unknown: page.unknown };
      }
      catch {
        throw new CustomSsoStateUnavailableError();
      }
    },
    inspect,
  };
}

export function createUnifiedCustomSsoInventory(redis: CustomSsoInventoryRedis, namespace: string) {
  return { inventory: createInventory(redis, namespace).inventory };
}

export function createUnifiedCustomSsoMaintenance(redis: CustomSsoMaintenanceRedis, namespace: string) {
  const inventory = createInventory(redis, namespace);
  return {
    inventory: inventory.inventory,
    async apply(input: CustomSsoInventoryInput = {}) {
      const page = await inventory.inspect(input);
      let removed = 0;
      let changed = 0;
      let unknown = page.unknown;
      for (const record of page.records) {
        try {
          const relatedKey = record.reverseKey ?? record.orphanTarget;
          const keys = relatedKey ? [record.key, relatedKey] : [record.key];
          const result = await redis.eval(
            `if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; if ARGV[3]=='orphan' and redis.call('EXISTS',KEYS[2])>0 then return 0 end; redis.call('DEL',KEYS[1]); if ARGV[3]~='orphan' and KEYS[2] and redis.call('GET',KEYS[2])==ARGV[2] then redis.call('DEL',KEYS[2]) end; return 1`,
            keys.length,
            ...keys,
            record.raw,
            record.digest ?? "",
            record.orphanTarget ? "orphan" : "record",
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
