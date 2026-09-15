interface ScanRedis {
  scan: (cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: string) => Promise<[string, string[]]>;
}

export function createScanVerifier(redis: ScanRedis, prefix: string) {
  return {
    async verify(signal?: AbortSignal) {
      let cursor = "0";
      let matching = 0;
      do {
        signal?.throwIfAborted();
        const page = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", "100");
        if (!Array.isArray(page) || page.length !== 2 || !/^\d+$/u.test(page[0]) || !Array.isArray(page[1]) || page[1].some(key => !key.startsWith(prefix)))
          throw new Error("Custom SSO verification unavailable");
        cursor = page[0];
        matching += page[1].length;
      } while (cursor !== "0");
      return { matching };
    },
  };
}
