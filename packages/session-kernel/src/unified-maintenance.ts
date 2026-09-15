import type { MaintenanceScanRedis } from "./storage/maintenance-scan";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { createMaintenanceVerifier } from "./storage/maintenance-scan";
import { sessionRecordSchema } from "./unified/model";

export interface UnifiedSessionInventoryRedis {
  scan: (
    cursor: string,
    match: "MATCH",
    pattern: string,
    count: "COUNT",
    limit: string,
  ) => Promise<[string, string[]]>;
  type: (key: string) => Promise<string>;
  get: (key: string) => Promise<string | null>;
  zrange: (key: string, start: number, end: number, withScores: "WITHSCORES") => Promise<string[]>;
}
export interface UnifiedSessionMaintenanceRedis extends UnifiedSessionInventoryRedis {
  eval: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
}
export interface UnifiedSessionInventoryInput {
  cursor?: string;
  limit?: number;
}

export function createUnifiedSessionVerifier(redis: MaintenanceScanRedis, namespace: string) {
  return createMaintenanceVerifier(redis, [
    `${z
      .string()
      .regex(/^[\w:-]+$/u)
      .parse(namespace)}:unified:v1:*`,
  ]);
}

const id = z.uuid();
const digest = /^[a-f0-9]{64}$/u;
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

function createInventory(redis: UnifiedSessionInventoryRedis, namespace: string) {
  const prefix = `${z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace)}:unified:v1:`;
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
      throw new Error("Session inventory unavailable");
    const pending = found.slice(limit);
    const nextCursor
      = scan === "0" && !pending.length
        ? "0"
        : Buffer.from(JSON.stringify({ scan, pending })).toString("base64url");
    const records: Array<{ key: string; kind: string; raw: string; partial?: boolean }> = [];
    let unknown = 0;
    for (const key of found.slice(0, limit)) {
      try {
        const kind = await redis.type(key);
        if (kind === "none")
          continue;
        const suffix = key.slice(prefix.length);
        const separator = suffix.indexOf(":");
        const family = suffix.slice(0, separator);
        const identity = suffix.slice(separator + 1);
        if (kind === "string") {
          const raw = await redis.get(key);
          if (raw === null)
            continue;
          if (family === "user" || family === "client") {
            const record = sessionRecordSchema.parse(JSON.parse(raw));
            if (
              record.expiresAt <= record.createdAt
              || (family === "user"
                ? record.kind !== "userSession" || !digest.test(identity)
                : record.kind !== "clientSession" || record.clientSessionId !== identity)
            ) {
              throw new Error("Invalid session identity");
            }
          }
          else if (family === "user-id") {
            id.parse(identity);
            if (!digest.test(raw))
              throw new Error("Invalid reverse identity");
          }
          else if (family === "slot") {
            id.parse(identity.slice(0, 36));
            if (identity[36] !== ":" || !identity.slice(37))
              throw new Error("Invalid slot identity");
            id.parse(raw);
          }
          else {
            throw new Error("Unknown session family");
          }
          records.push({ key, kind, raw });
        }
        else if (kind === "zset") {
          if (["subject", "subject-clients", "children"].includes(family))
            id.parse(identity);
          else if (family === "inventory")
            z.enum(["userSession", "clientSession"]).parse(identity);
          else if (family !== "client-index" || !identity)
            throw new Error("Unknown session index");
          const found = await redis.zrange(key, 0, 1000, "WITHSCORES");
          const partial = found.length > 2000;
          const members = found.slice(0, 2000);
          if (members.length % 2)
            throw new Error("Invalid session index");
          for (let i = 0; i < members.length; i += 2) {
            id.parse(members[i]);
            z.number()
              .int()
              .nonnegative()
              .safe()
              .parse(Number(members[i + 1]));
          }
          records.push({ key, kind, raw: JSON.stringify(members), partial });
        }
        else {
          throw new Error("Unknown session storage type");
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

/** Offline removal includes authoritative records, terminal records and independently discovered indexes. */
export function createUnifiedSessionInventory(redis: UnifiedSessionInventoryRedis, namespace: string) {
  return { inventory: createInventory(redis, namespace).inventory };
}

export function createUnifiedSessionMaintenance(redis: UnifiedSessionMaintenanceRedis, namespace: string) {
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
