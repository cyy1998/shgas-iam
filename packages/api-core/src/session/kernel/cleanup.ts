import type { CleanupRef, RevokeSummary } from "./model";

export type CleanupAdapter = {
  protocol: string;
  kind: string;
  cleanup: (refs: CleanupRef[]) => Promise<void>;
};

export type SessionKernelLogger = {
  warn?: (data: Record<string, unknown>, message: string) => void;
};

export async function runCleanupRefs(
  refs: CleanupRef[],
  adapters: CleanupAdapter[] = [],
  summary: RevokeSummary,
  logger?: SessionKernelLogger,
) {
  const grouped = groupCleanupRefs(refs);

  for (const [group, groupRefs] of grouped) {
    const [protocol, kind] = group.split(":", 2);
    summary.cleanup.attempted += groupRefs.length;
    const adapter = adapters.find(item => item.protocol === protocol && item.kind === kind);
    if (!adapter) {
      summary.cleanup.failed += groupRefs.length;
      for (const ref of groupRefs) {
        summary.cleanup.failures.push({
          protocol: ref.protocol,
          kind: ref.kind,
          ref: ref.ref,
          error: "cleanup adapter not configured",
        });
      }
      continue;
    }

    try {
      await adapter.cleanup(groupRefs);
      summary.cleanup.succeeded += groupRefs.length;
    }
    catch (error) {
      logger?.warn?.({ err: error, protocol, kind }, "session kernel cleanup failed");
      summary.cleanup.failed += groupRefs.length;
      for (const ref of groupRefs) {
        summary.cleanup.failures.push({
          protocol: ref.protocol,
          kind: ref.kind,
          ref: ref.ref,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

function groupCleanupRefs(refs: CleanupRef[]) {
  const groups = new Map<string, CleanupRef[]>();
  for (const ref of refs) {
    const key = `${ref.protocol}:${ref.kind}`;
    groups.set(key, [...groups.get(key) ?? [], ref]);
  }
  return groups;
}
