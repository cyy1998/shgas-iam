import { Buffer } from "node:buffer";
import { z } from "zod";

export interface MaintenanceScanRedis {
  scan: (cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: string) => Promise<[string, string[]]>;
}

export interface MaintenanceRemovalRedis extends MaintenanceScanRedis {
  unlink: (...keys: string[]) => Promise<number>;
}

const inputSchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .strict();
export type MaintenanceScanInput = z.infer<typeof inputSchema>;
const cursorSchema = z.object({ scan: z.string().regex(/^\d+$/u), pending: z.array(z.string()) }).strict();

function validatePrefix(prefix: string) {
  return z
    .string()
    .regex(/^[\w:-]+:$/u)
    .parse(prefix);
}

function validatePage(page: unknown, prefix: string): asserts page is [string, string[]] {
  if (
    !Array.isArray(page) ||
    page.length !== 2 ||
    typeof page[0] !== "string" ||
    !/^\d+$/u.test(page[0]) ||
    !Array.isArray(page[1]) ||
    page[1].some((key) => typeof key !== "string" || !key.startsWith(prefix))
  ) {
    throw new Error("Session maintenance scan unavailable");
  }
}

function createScanner(redis: MaintenanceScanRedis, ownerPrefix: string) {
  const prefix = validatePrefix(ownerPrefix);
  async function inspect(rawInput: MaintenanceScanInput = {}) {
    const input = inputSchema.parse(rawInput);
    const cursor =
      !input.cursor || input.cursor === "0"
        ? { scan: "0", pending: [] as string[] }
        : cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
    const limit = input.limit ?? 100;
    const page = cursor.pending.length
      ? [cursor.scan, cursor.pending]
      : await redis.scan(cursor.scan, "MATCH", `${prefix}*`, "COUNT", String(limit));
    validatePage(page, prefix);
    const [scan, found] = page;
    // COUNT is a hint: retain overflow so each destructive page remains bounded.
    const keys = [...new Set(found.slice(0, limit))];
    const pending = found.slice(limit);
    const nextCursor =
      scan === "0" && !pending.length ? "0" : Buffer.from(JSON.stringify({ scan, pending })).toString("base64url");
    return { keys, nextCursor };
  }
  return {
    inspect,
    async inventory(input: MaintenanceScanInput = {}) {
      const page = await inspect(input);
      return { nextCursor: page.nextCursor, matching: page.keys.length, unknown: 0 };
    },
  };
}

/** Inventory only observes key ownership; stored formats and Redis types are irrelevant. */
export function createMaintenanceInventory(redis: MaintenanceScanRedis, prefix: string) {
  return { inventory: createScanner(redis, prefix).inventory };
}

/** Writers must be drained before removal; only an independent scan proves completion. */
export function createMaintenanceRemoval(redis: MaintenanceRemovalRedis, prefix: string) {
  const scanner = createScanner(redis, prefix);
  return {
    inventory: scanner.inventory,
    async apply(input: MaintenanceScanInput = {}) {
      const page = await scanner.inspect(input);
      let removed = 0;
      let unknown = 0;
      if (page.keys.length) {
        try {
          const result = await redis.unlink(...page.keys);
          if (!Number.isSafeInteger(result) || result < 0 || result > page.keys.length) {
            throw new Error("Session removal response unavailable");
          }
          removed = result;
        } catch {
          // A lost response can follow a committed UNLINK; do not infer its outcome.
          unknown = page.keys.length;
        }
      }
      return { nextCursor: page.nextCursor, matching: page.keys.length, removed, unknown };
    },
  };
}

/** Verification is a fresh complete pass and needs only SCAN. */
export function createMaintenanceVerifier(redis: MaintenanceScanRedis, ownerPrefix: string) {
  const prefix = validatePrefix(ownerPrefix);
  return {
    async verify(signal?: AbortSignal) {
      let matching = 0;
      let cursor = "0";
      let pages = 0;
      do {
        signal?.throwIfAborted();
        if (++pages > 100000) throw new Error("Session verification scan limit exceeded");
        const page = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", "100");
        signal?.throwIfAborted();
        validatePage(page, prefix);
        cursor = page[0];
        matching += page[1].length;
      } while (cursor !== "0");
      return { matching };
    },
  };
}
