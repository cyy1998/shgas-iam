import { decodeCustomSsoLegacyGrant } from "./maintenance";
import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX } from "./redis-store";

interface LegacyGrantReader {
  scan: (cursor: string, match: "MATCH", pattern: string, count: "COUNT", size: number) => Promise<[string, string[]]>;
  get: (key: string) => Promise<string | null>;
}
interface LegacyGrantWriter extends LegacyGrantReader {
  eval: (script: string, keyCount: number, ...args: Array<string | number>) => Promise<unknown>;
}

const REMOVE_OBSERVED_GRANT = `
-- custom-sso-remove-observed-legacy-grant-v1
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;
interface Options { redis: LegacyGrantReader; writersStopped: boolean; signal?: AbortSignal }

export function createLegacyGrantVerifier(options: Options) {
  return { inventory: () => scanGrants(options, false), verify: () => scanGrants(options, true) };
}
export function createLegacyGrantMaintenance(options: Options & { redis: LegacyGrantWriter }) {
  return { apply: () => scanGrants(options, false, options.redis) };
}

async function scanGrants(options: Options, verify: boolean, writer?: LegacyGrantWriter) {
  const report = {
    status: "failed" as "passed" | "failed",
    targets: 0,
    removed: 0,
    failed: 0,
    unverified: 0,
    scanComplete: false,
    states: { issued: 0, redeeming: 0, consumed: 0 },
  };
  try {
    if (!options.writersStopped)
      throw new Error("Stopped writers required");
    let cursor = "0";
    const seen = new Set<string>();
    do {
      options.signal?.throwIfAborted();
      const [next, page] = await options.redis.scan(cursor, "MATCH", `${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}*`, "COUNT", 100);
      cursor = next;
      for (const key of page) {
        options.signal?.throwIfAborted();
        if (seen.has(key))
          continue;
        seen.add(key);
        try {
          const raw = await options.redis.get(key);
          if (raw === null)
            continue;
          const record = decodeCustomSsoLegacyGrant(key, raw);
          report.targets++;
          report.states[record.state]++;
          if (!writer)
            continue;
          options.signal?.throwIfAborted();
          const result = await writer.eval(REMOVE_OBSERVED_GRANT, 1, key, raw);
          if (result !== 1 && result !== "1")
            throw new Error("Grant removal not confirmed");
          report.removed++;
        }
        catch { report.failed++; }
      }
    } while (cursor !== "0");
    report.scanComplete = true;
    report.status = report.failed === 0 && (!verify || report.targets === 0) ? "passed" : "failed";
  }
  catch { report.unverified++; }
  return report;
}
