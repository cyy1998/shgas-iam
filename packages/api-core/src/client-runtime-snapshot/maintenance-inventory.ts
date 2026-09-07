// v1 is the current Snapshot storage namespace, owned by maintenance.
export const CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS = [
  { kind: "versioned", pattern: "client-runtime-snapshot:v1:*" },
] as const;
