import { Buffer } from "node:buffer";
import { ClientCodeSchema } from "@iam/contracts";
import { z } from "zod";
import { decodeOfflineProviderModel, decodeOfflineProviderSession, decodeParts } from "./record";

interface ScanRedis {
  scan: (
    cursor: string,
    match: "MATCH",
    pattern: string,
    count: "COUNT",
    limit: string,
  ) => Promise<[string, string[]]>;
}
interface Reader extends ScanRedis {
  type: (key: string) => Promise<string>;
  get: (key: string) => Promise<string | null>;
  zrange: (key: string, start: number, end: number, withScores: "WITHSCORES") => Promise<string[]>;
  smembers: (key: string) => Promise<string[]>;
  scard: (key: string) => Promise<number>;
  srandmember: (key: string, count: number) => Promise<string[]>;
}
interface Writer extends Reader {
  eval: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
}
interface Input {
  cursor?: string;
  limit?: number;
}

const prefixes = [
  "oidc:model:",
  "oidc:consumed:",
  "oidc:grant-objects:",
  "oidc:client-objects:",
  "oidc:session-uid:",
  "oidc:user-code:",
  "oidc:provider-session-binding-lookup:",
  "oidc:provider-session-principal:",
  "oidc:provider-session-generation-members:",
  "oidc:pending-provider-session-binding:",
  "oidc:pending-provider-session-bindings:client:",
] as const;
const modelKey = /^oidc:model:(?:AuthorizationCode|AccessToken|Grant|Session|Interaction):[\w-]+$/u;
const text = z.string().regex(/^[\w-]{1,512}$/u);
const cas = `
local kind=redis.call('TYPE',KEYS[1]).ok
if kind~=ARGV[1] then return 0 end
if kind=='string' then
  if redis.call('GET',KEYS[1])~=ARGV[2] then return 0 end
else
  local expected=cjson.decode(ARGV[2])
  if kind=='set' and ARGV[3]=='partial' then
    for i=1,#expected do if redis.call('SISMEMBER',KEYS[1],expected[i])~=1 then return 0 end end
    for i=1,#expected do redis.call('SREM',KEYS[1],expected[i]) end
    return 2
  end
  local actual
  if kind=='set' then actual=redis.call('SMEMBERS',KEYS[1]); table.sort(actual)
  else actual=redis.call('ZRANGE',KEYS[1],0,ARGV[3]=='partial' and 999 or 1000,'WITHSCORES') end
  if #actual~=#expected then return 0 end
  for i=1,#actual do if actual[i]~=expected[i] then return 0 end end
  if ARGV[3]=='partial' then
    for i=1,#expected,2 do redis.call('ZREM',KEYS[1],expected[i]) end
    return 2
  end
end
return redis.call('DEL',KEYS[1])
`;

function createInventory(redis: Reader) {
  async function inspect(input: Input = {}) {
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
      : await redis.scan(cursor.scan, "MATCH", "oidc:*", "COUNT", String(limit));
    if (!/^\d+$/u.test(scan) || found.some(key => !key.startsWith("oidc:")))
      throw new Error("Offline Provider inventory unavailable");
    const pending = found.slice(limit);
    const nextCursor
      = scan === "0" && !pending.length
        ? "0"
        : Buffer.from(JSON.stringify({ scan, pending })).toString("base64url");
    const records: Array<{ key: string; kind: string; raw: string; partial?: boolean }> = [];
    let unknown = 0;
    for (const key of found.slice(0, limit)) {
      const prefix = prefixes.find(prefix => key.startsWith(prefix));
      if (!prefix)
        continue;
      try {
        const kind = await redis.type(key);
        if (kind === "none")
          continue;
        if (kind === "string") {
          const raw = await redis.get(key);
          if (raw === null)
            continue;
          if (prefix === "oidc:model:") {
            decodeOfflineProviderModel(key, raw);
          }
          else if (prefix === "oidc:consumed:") {
            if (
              !modelKey.test(key.replace("oidc:consumed:", "oidc:model:"))
              || !/^\d+$/u.test(raw)
              || !Number.isSafeInteger(Number(raw))
            ) {
              throw new Error("Unknown consumed marker");
            }
          }
          else if (prefix === "oidc:session-uid:" || prefix === "oidc:user-code:") {
            text.parse(key.slice(prefix.length));
            text.parse(raw);
          }
          else {
            decodeOfflineProviderSession(key, raw);
          }
          records.push({ key, kind, raw });
        }
        else if (kind === "zset") {
          if (prefix === "oidc:pending-provider-session-bindings:client:")
            decodeParts(key.slice(prefix.length), 1);
          else if (prefix === "oidc:client-objects:")
            ClientCodeSchema.parse(key.slice(prefix.length));
          else if (prefix === "oidc:grant-objects:")
            text.parse(key.slice(prefix.length));
          else throw new Error("Unknown Provider index");
          const found = await redis.zrange(key, 0, 1000, "WITHSCORES");
          const partial = found.length > 2000;
          const members = found.slice(0, 2000);
          if (members.length % 2)
            throw new Error("Invalid Provider index");
          for (let i = 0; i < members.length; i += 2) {
            if (prefix === "oidc:pending-provider-session-bindings:client:") {
              if (!members[i]!.startsWith("oidc:pending-provider-session-binding:"))
                throw new Error("Unknown pending member");
              decodeParts(members[i]!.slice("oidc:pending-provider-session-binding:".length), 1);
            }
            else if (!modelKey.test(members[i]!)) {
              throw new Error("Unknown model member");
            }
            z.number()
              .int()
              .nonnegative()
              .safe()
              .parse(Number(members[i + 1]));
          }
          records.push({ key, kind, raw: JSON.stringify(members), partial });
        }
        else if (kind === "set" && prefix === "oidc:provider-session-generation-members:") {
          decodeParts(key.slice(prefix.length), 2);
          const partial = (await redis.scard(key)) > 1000;
          const members = partial ? await redis.srandmember(key, 1000) : await redis.smembers(key);
          if (members.length > 1000 || members.length === 0)
            throw new Error("Provider membership changed");
          members.forEach(member => text.parse(member));
          records.push({ key, kind, raw: JSON.stringify(members.sort()), partial });
        }
        else {
          throw new Error("Unknown offline Provider storage type");
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
    async inventory(input: Input = {}) {
      const page = await inspect(input);
      return {
        nextCursor: page.nextCursor,
        matching: page.records.length,
        unknown: page.unknown + page.records.filter(record => record.partial).length,
      };
    },
  };
}

export function createOfflineOidcInventory(redis: Reader) {
  return { inventory: createInventory(redis).inventory };
}
export function createOfflineOidcMaintenance(redis: Writer) {
  const inventory = createInventory(redis);
  return {
    inventory: inventory.inventory,
    async apply(input: Input = {}) {
      const page = await inventory.inspect(input);
      let removed = 0;
      let changed = 0;
      let unknown = page.unknown;
      for (const record of page.records) {
        try {
          const result = await redis.eval(
            cas,
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

export function createOfflineOidcVerifier(redis: ScanRedis) {
  return {
    async verify(signal?: AbortSignal) {
      let matching = 0;
      for (const prefix of prefixes) {
        let cursor = "0";
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
            throw new Error("Offline Provider verification unavailable");
          }
          cursor = page[0];
          matching += page[1].length;
        } while (cursor !== "0");
      }
      return { matching };
    },
  };
}
