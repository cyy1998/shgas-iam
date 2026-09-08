export interface OwnedStateRedis {
  scan: (cursor: string, match: "MATCH", pattern: string, count: "COUNT", size: number) => Promise<[string, string[]]>;
  unlink: (...keys: string[]) => Promise<number>;
}

/** Only callers that own the supplied literal prefixes may use this stopped-writer operation. */
export async function maintainOwnedRedisState(
  redis: OwnedStateRedis,
  prefixes: readonly string[],
  operation: "dry-run" | "apply" | "verify",
  signal?: AbortSignal,
) {
  let observed = 0;
  let removed = 0;
  for (const prefix of prefixes) {
    if (!prefix || !prefix.endsWith(":"))
      throw new Error("Invalid maintenance owner prefix");
    const pattern = `${prefix.replaceAll(/[\\*?[\]]/gu, "\\$&")}*`;
    let cursor = "0";
    do {
      signal?.throwIfAborted();
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      signal?.throwIfAborted();
      if (!/^\d+$/u.test(nextCursor) || keys.some(key => !key.startsWith(prefix)))
        throw new Error("Invalid maintenance scan result");
      observed += keys.length;
      if (operation === "apply") {
        for (let offset = 0; offset < keys.length; offset += 100) {
          signal?.throwIfAborted();
          removed += await redis.unlink(...keys.slice(offset, offset + 100));
        }
      }
      cursor = nextCursor;
    } while (cursor !== "0");
  }
  return { observed, removed };
}
