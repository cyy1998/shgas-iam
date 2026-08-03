import { SystemLogEvent } from "@iam/api-core/logger";
import { describe, expect, mock, test } from "bun:test";
import { createSubjectFactsLoggerObservability } from "../subject-facts";

describe("Subject Facts observability", () => {
  test("logs only the bounded operation, outcome, and duration fields", () => {
    const info = mock(() => {});
    const observability = createSubjectFactsLoggerObservability({ info });

    observability.record({
      operation: "cache-read",
      outcome: "hit",
      durationMs: 7,
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
      subjectFacts: { employments: [{ secret: "facts-secret" }] },
      querySessionToken: "query-session-token-secret",
      secret: "custom-sso-secret",
    } as never);

    expect(info).toHaveBeenCalledWith({
      event: SystemLogEvent.SubjectFactsOperationObserved,
      operation: "cache-read",
      outcome: "hit",
      durationMs: 7,
    }, "Subject Facts operation observed");
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).not.toContain("00000000-0000-4000-8000-000000000001");
    expect(serialized).not.toContain("facts-secret");
    expect(serialized).not.toContain("query-session-token-secret");
    expect(serialized).not.toContain("custom-sso-secret");
  });
});
