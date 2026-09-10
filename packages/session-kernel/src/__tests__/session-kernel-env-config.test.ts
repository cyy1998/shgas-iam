import {
  createSessionKernelConfigFromEnv,
} from "@iam/session-kernel";
import { describe, expect, test } from "bun:test";

describe("session kernel env config helper", () => {
  test("maps second-based env values into normalized millisecond config", () => {
    const config = createSessionKernelConfigFromEnv({
      namespace: "custom-session",
      principalIdleTtlSeconds: 60,
      principalAbsoluteTtlSeconds: 300,
      tombstoneTtlSeconds: 120,
      tombstoneGraceSeconds: 30,
      clock: { now: () => 123 },
    });

    expect(config.namespace).toBe("custom-session:");
    expect(config.principalIdleTtlMs).toBe(60_000);
    expect(config.principalAbsoluteTtlMs).toBe(300_000);
    expect(config.tombstoneTtlMs).toBe(120_000);
    expect(config.tombstoneGraceMs).toBe(30_000);
    expect(config.clock.now()).toBe(123);
  });

  test("uses the app fallback principal TTL when per-field TTLs are omitted", () => {
    const config = createSessionKernelConfigFromEnv({
      defaultPrincipalTtlSeconds: 86_400,
    });

    expect(config.principalIdleTtlMs).toBe(86_400_000);
    expect(config.principalAbsoluteTtlMs).toBe(86_400_000);
  });

  test("rejects invalid TTL ordering", () => {
    const base = {
      principalIdleTtlSeconds: 300,
      principalAbsoluteTtlSeconds: 60,
    };

    expect(() => createSessionKernelConfigFromEnv(base)).toThrow(
      "principalAbsoluteTtlMs must be greater than or equal to principalIdleTtlMs",
    );
  });
});
