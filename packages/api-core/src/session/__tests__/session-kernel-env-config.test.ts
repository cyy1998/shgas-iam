import {
  createSessionKernelConfigFromEnv,
  DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
} from "@iam/api-core/session/kernel";
import { describe, expect, test } from "bun:test";

describe("session kernel env config helper", () => {
  test("maps second-based env values into normalized millisecond config", () => {
    const config = createSessionKernelConfigFromEnv({
      namespace: "custom-session",
      principalIdleTtlSeconds: 60,
      principalAbsoluteTtlSeconds: 300,
      tombstoneTtlSeconds: 120,
      tombstoneGraceSeconds: 30,
      lookupHmacCurrentId: "current",
      lookupHmacCurrentSecret: "c".repeat(32),
      lookupHmacPreviousId: "previous",
      lookupHmacPreviousSecret: "p".repeat(32),
      clock: { now: () => 123 },
    });

    expect(config.namespace).toBe("custom-session:");
    expect(config.principalIdleTtlMs).toBe(60_000);
    expect(config.principalAbsoluteTtlMs).toBe(300_000);
    expect(config.tombstoneTtlMs).toBe(120_000);
    expect(config.tombstoneGraceMs).toBe(30_000);
    expect(config.lookupHmacKeys.current.id).toBe("current");
    expect(config.lookupHmacKeys.previous?.id).toBe("previous");
    expect(config.clock.now()).toBe(123);
  });

  test("uses the app fallback principal TTL when per-field TTLs are omitted", () => {
    const config = createSessionKernelConfigFromEnv({
      defaultPrincipalTtlSeconds: 86_400,
      lookupHmacCurrentSecret: "c".repeat(32),
    });

    expect(config.principalIdleTtlMs).toBe(86_400_000);
    expect(config.principalAbsoluteTtlMs).toBe(86_400_000);
  });

  test("requires an explicit non-default current secret in production", () => {
    const base = {
      principalIdleTtlSeconds: 60,
      principalAbsoluteTtlSeconds: 60,
      lookupHmacCurrentId: "current",
      nodeEnv: "production",
    };

    expect(() => createSessionKernelConfigFromEnv(base)).toThrow("must be set in production");
    expect(() => createSessionKernelConfigFromEnv({
      ...base,
      lookupHmacCurrentSecret: DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
    })).toThrow("must be set in production");
  });

  test("requires previous lookup key id and secret to be configured together", () => {
    const base = {
      principalIdleTtlSeconds: 60,
      principalAbsoluteTtlSeconds: 60,
      lookupHmacCurrentSecret: "c".repeat(32),
    };

    expect(() => createSessionKernelConfigFromEnv({
      ...base,
      lookupHmacPreviousId: "previous",
    })).toThrow("must be configured together");
    expect(() => createSessionKernelConfigFromEnv({
      ...base,
      lookupHmacPreviousSecret: "p".repeat(32),
    })).toThrow("must be configured together");
  });

  test("fails closed for ambiguous HMAC rotation and invalid TTL ordering", () => {
    const base = {
      principalIdleTtlSeconds: 300,
      principalAbsoluteTtlSeconds: 60,
      lookupHmacCurrentId: "current",
      lookupHmacCurrentSecret: "c".repeat(32),
    };

    expect(() => createSessionKernelConfigFromEnv(base)).toThrow(
      "principalAbsoluteTtlMs must be greater than or equal to principalIdleTtlMs",
    );
    expect(() => createSessionKernelConfigFromEnv({
      ...base,
      principalAbsoluteTtlSeconds: 300,
      lookupHmacPreviousId: "current",
      lookupHmacPreviousSecret: "p".repeat(32),
    })).toThrow("ids must be different");
    expect(() => createSessionKernelConfigFromEnv({
      ...base,
      principalAbsoluteTtlSeconds: 300,
      lookupHmacPreviousId: "previous",
      lookupHmacPreviousSecret: "c".repeat(32),
    })).toThrow("secrets must be different");
  });
});
