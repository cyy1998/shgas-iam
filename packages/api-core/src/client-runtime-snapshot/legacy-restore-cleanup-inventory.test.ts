import { describe, expect, test } from "bun:test";
import {
  CLIENT_RUNTIME_SNAPSHOT_LEGACY_RESTORE_CLEANUP_PATTERNS,
  CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS,
} from "./legacy-restore-cleanup-inventory";

describe("Client Runtime Snapshot legacy restore cleanup inventory", () => {
  test("owns the complete closed legacy runtime key catalog", () => {
    expect(CLIENT_RUNTIME_SNAPSHOT_LEGACY_RESTORE_CLEANUP_PATTERNS).toEqual([
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
    ]);
  });

  test("adds the versioned namespace to the full restore inventory", () => {
    expect(CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS).toEqual([
      { kind: "versioned", pattern: "client-runtime-snapshot:v1:*" },
      ...CLIENT_RUNTIME_SNAPSHOT_LEGACY_RESTORE_CLEANUP_PATTERNS,
    ]);
  });
});
