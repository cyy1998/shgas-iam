import { describe, expect, test } from "bun:test";
import {
  seedProcessSmokePrincipalSession,
} from "../process-smoke-redis-server";

describe("process smoke Redis server", () => {
  test("preserves cleanup refs when seeding a Principal Session", () => {
    const values = new Map<string, string>();
    const cleanupRefs = [{
      protocol: "custom-sso",
      kind: "local_session_payload",
      ref: "legacy-payload",
    }];

    const principal = seedProcessSmokePrincipalSession({
      set: (key, value) => values.set(key, value),
    }, {
      cleanupRefs,
      externalToken: `iam_ps_${"a".repeat(43)}`,
      lookupHmacId: "current",
      lookupHmacSecret: "process-smoke-test-secret-that-is-at-least-32-bytes",
      namespace: "process-smoke-test:",
      now: 1_000,
      principalSessionId: "principal-session",
      subjectAccessTransitionId: "10000000-0000-4000-8000-000000000001",
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
    });

    const serialized = [...values.values()].find(value => value.startsWith("{"));
    expect(principal.cleanupRefs).toEqual(cleanupRefs);
    expect(serialized).toBeDefined();
    expect(JSON.parse(serialized ?? "null")).toMatchObject({ cleanupRefs });
  });
});
