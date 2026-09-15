export interface MaintenanceScanRedis {
  scan: (cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: string) => Promise<[string, string[]]>;
}

/** Full-scope verification needs only SCAN. Counts never substitute for a complete independent pass. */
export function createMaintenanceVerifier(redis: MaintenanceScanRedis, patterns: readonly string[]) {
  return {
    async verify(signal?: AbortSignal) {
      let matching = 0;
      for (const pattern of patterns) {
        let cursor = "0";
        do {
          signal?.throwIfAborted();
          const page = await redis.scan(cursor, "MATCH", pattern, "COUNT", "100");
          if (!Array.isArray(page) || page.length !== 2 || !/^\d+$/u.test(page[0]) || !Array.isArray(page[1]))
            throw new Error("Session verification unavailable");
          cursor = page[0];
          matching += page[1].length;
        } while (cursor !== "0");
      }
      return { matching };
    },
  };
}
