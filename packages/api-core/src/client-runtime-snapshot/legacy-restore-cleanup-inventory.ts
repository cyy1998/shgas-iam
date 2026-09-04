import type { ClientRuntimeSnapshotKind } from "./contract";

interface ClientRuntimeSnapshotLegacyRestoreCleanupPattern {
  readonly kind: ClientRuntimeSnapshotKind;
  readonly pattern: string;
}

export const CLIENT_RUNTIME_SNAPSHOT_LEGACY_RESTORE_CLEANUP_PATTERNS = [
  { kind: "oidc", pattern: "oidc:client-runtime:*" },
  { kind: "custom-sso", pattern: "custom-sso:client-runtime:*" },
  {
    kind: "custom-sso",
    pattern: "custom-sso:client-runtime-generation:*",
  },
  {
    kind: "custom-sso",
    pattern: "custom-sso:client-runtime-mutation:*",
  },
  { kind: "traffic-gate", pattern: "client:traffic-gate:*" },
  {
    kind: "traffic-gate",
    pattern: "client:traffic-gate-generation:*",
  },
  {
    kind: "traffic-gate",
    pattern: "client:traffic-gate-mutation:*",
  },
] as const satisfies readonly ClientRuntimeSnapshotLegacyRestoreCleanupPattern[];

export const CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS = [
  { kind: "versioned", pattern: "client-runtime-snapshot:v1:*" },
  ...CLIENT_RUNTIME_SNAPSHOT_LEGACY_RESTORE_CLEANUP_PATTERNS,
] as const;
