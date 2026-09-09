import type { ProtocolArtifact, RevokedTombstone } from "../state/model";
import { parseLifecycleObject, parseRevokedTombstone } from "../state/model";
import { createSessionKernelKeyBuilder, encodeIndexMember } from "./keys";

export interface ArtifactMaintenanceReader {
  scan: (cursor: string, match: "MATCH", pattern: string, count: "COUNT", size: number) => Promise<[string, string[]]>;
  get: (key: string) => Promise<string | null>;
}
export interface ArtifactMaintenanceWriter extends ArtifactMaintenanceReader {
  eval: (script: string, keyCount: number, ...args: Array<string | number>) => Promise<unknown>;
}
export type ArtifactMaintenanceObject = ProtocolArtifact | RevokedTombstone;
export type ArtifactMaintenanceReport = {
  status: "passed" | "failed";
  targets: number;
  removed: number;
  retained: number;
  failed: number;
  unverified: number;
  scanComplete: boolean;
};
type Options = {
  namespace: string;
  writersStopped: boolean;
  select: (object: ArtifactMaintenanceObject) => "select" | "retain" | "unconfirmed";
  signal?: AbortSignal;
};

const REMOVE_OBSERVED_ARTIFACT = `
-- session-kernel-maintain-observed-artifact-v1
for i = 1, 4 do
  local value = redis.call("GET", KEYS[i])
  local present = ARGV[(i - 1) * 2 + 1] == "1"
  if (present and value ~= ARGV[(i - 1) * 2 + 2]) or (not present and value) then
    return 0
  end
end
-- Validate every index before the first write: Lua runtime errors do not roll back writes.
for i = 5, #KEYS do
  local kind = redis.call("TYPE", KEYS[i]).ok
  if kind ~= "none" and kind ~= "zset" then return -1 end
end
local removed = redis.call("DEL", KEYS[1], KEYS[2], KEYS[3], KEYS[4])
for i = 5, #KEYS do redis.call("ZREM", KEYS[i], ARGV[9]) end
return removed > 0 and 1 or 0
`;

/** Separate factory: the verifier never receives an eval/write capability. */
export function createArtifactMaintenanceVerifier(options: Options & { redis: ArtifactMaintenanceReader }) {
  return {
    inventory: () => scanArtifacts(options, false),
    verify: () => scanArtifacts(options, true),
  };
}

export function createArtifactMaintenance(options: Options & { redis: ArtifactMaintenanceWriter }) {
  return { apply: () => scanArtifacts(options, false, options.redis) };
}

async function scanArtifacts(options: Options & { redis: ArtifactMaintenanceReader }, verify: boolean, writer?: ArtifactMaintenanceWriter) {
  const report: ArtifactMaintenanceReport = {
    status: "failed",
    targets: 0,
    removed: 0,
    retained: 0,
    failed: 0,
    unverified: 0,
    scanComplete: false,
  };
  try {
    if (!options.writersStopped || !options.namespace.trim() || /[*?[\]\\]/.test(options.namespace))
      throw new Error("Explicit stopped writers and literal namespace required");
    const keys = createSessionKernelKeyBuilder(options.namespace);
    const families = ["active", "revoked", "lookup", "revoked_lookup"] as const;
    const seen = new Set<string>();
    const attempted = new Set<string>();
    for (const family of families) {
      const prefix = `${keys.namespace}${family}:a:`;
      let cursor = "0";
      do {
        options.signal?.throwIfAborted();
        const [next, page] = await options.redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
        cursor = next;
        for (const key of page) {
          options.signal?.throwIfAborted();
          if (seen.has(key))
            continue;
          seen.add(key);
          try {
            if (!key.startsWith(prefix))
              throw new Error("Unexpected inventory key");
            const raw = await options.redis.get(key);
            if (raw === null)
              continue;
            let object: ArtifactMaintenanceObject;
            let selectedObjectRaw = raw;
            if (family === "active" || family === "lookup") {
              const value = family === "lookup" ? await options.redis.get(keys.active("artifact", raw)) : raw;
              const parsed = value === null ? null : parseLifecycleObject("artifact", value);
              if (!parsed?.success)
                throw new Error("Unconfirmed active artifact");
              selectedObjectRaw = value!;
              object = parsed.data;
              const expected = family === "lookup" ? keys.lookup("artifact", object.lookupHash) : keys.active("artifact", object.artifactId);
              if (key !== expected || (family === "lookup" && raw !== object.artifactId))
                throw new Error("Artifact identity mismatch");
            }
            else {
              const parsed = parseRevokedTombstone(raw);
              if (!parsed.success || parsed.data.objectKind !== "artifact" || !parsed.data.lookupHash || !parsed.data.protocol || typeof parsed.data.metadata?.artifactType !== "string")
                throw new Error("Unconfirmed artifact tombstone");
              object = parsed.data;
              const expected = family === "revoked" ? keys.tombstone("artifact", object.objectId) : keys.lookupTombstone("artifact", object.lookupHash!);
              if (key !== expected)
                throw new Error("Tombstone identity mismatch");
            }
            const selection = options.select(object);
            if (selection === "unconfirmed")
              throw new Error("Unconfirmed protocol ownership");
            if (selection === "retain") {
              report.retained++;
              continue;
            }
            report.targets++;
            if (!writer)
              continue;
            const id = "artifactId" in object ? object.artifactId : object.objectId;
            // A changed identity is never re-selected through another lookup during this run.
            if (attempted.has(id))
              continue;
            attempted.add(id);
            const hash = object.lookupHash!;
            const related = [keys.active("artifact", id), keys.lookup("artifact", hash), keys.tombstone("artifact", id), keys.lookupTombstone("artifact", hash)];
            const observed = await Promise.all(related.map(target => options.redis.get(target)));
            // The selection is bound to the original bytes, even if this identity changes while reading its siblings.
            if (observed[related.indexOf(key)] !== raw)
              throw new Error("Selected artifact changed");
            const active = "artifactId" in object;
            if (active) {
              if (observed[0] !== selectedObjectRaw || observed[2] !== null || observed[3] !== null || (observed[1] !== null && observed[1] !== id))
                throw new Error("Conflicting artifact ownership");
            }
            else if (observed[0] !== null || observed[1] !== null || observed.some((value, index) => index >= 2 && value !== null && value !== raw)) {
              throw new Error("Conflicting tombstone ownership");
            }
            const indexes = [
              ...(object.principalSessionId ? [keys.index.principal(object.principalSessionId)] : []),
              ...(object.bindingId ? [keys.index.binding(object.bindingId)] : []),
              ...(object.protocol ? [keys.index.protocol(object.protocol)] : []),
              ...(object.clientCode && object.protocol ? [keys.index.client(object.clientCode), keys.index.clientProtocol(object.clientCode, object.protocol), keys.index.clientProtocolCleanup(object.clientCode, object.protocol)] : []),
            ];
            options.signal?.throwIfAborted();
            const result = await writer.eval(REMOVE_OBSERVED_ARTIFACT, 4 + indexes.length, ...related, ...indexes, ...observed.flatMap(value => [value === null ? "0" : "1", value ?? ""]), encodeIndexMember("artifact", id));
            if (result !== 1 && result !== "1")
              throw new Error("Artifact removal not confirmed");
            report.removed++;
          }
          catch { report.failed++; }
        }
      } while (cursor !== "0");
    }
    report.scanComplete = true;
    report.status = report.failed === 0 && (!verify || report.targets === 0) ? "passed" : "failed";
  }
  catch { report.unverified++; }
  return report;
}
