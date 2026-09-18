import { describe, expect, test } from "bun:test";
import { SessionManagementListSessionsInputSchema, SessionManagementSessionVoSchema } from "../session-management.schema";

function sessionVo(subjectId: string) {
  return {
    principalSessionId: "ps-42",
    user: {
      id: 42,
      subjectId,
      username: "alice",
      name: "Alice",
      accountStatus: "normal",
    },
    authMethods: ["password"],
    authTime: 1_753_689_600_000,
    expiresAt: 1_753_776_000_000,
    origin: null,
    isCurrentSession: false,
    isCurrentUser: false,
  };
}

describe("Session Management response contract", () => {
  test("root filtering requires application session queries", () => {
    const userSessionId = "00000000-0000-4000-8000-000000000042";
    for (const kind of [undefined, "userSession"]) {
      const result = SessionManagementListSessionsInputSchema.safeParse({ conditions: { kind, userSessionId } });
      expect(result.success).toBe(false);
    }
    const valid = SessionManagementListSessionsInputSchema.parse({
      conditions: { kind: "clientSession", userSessionId },
    });
    expect(valid.conditions.userSessionId).toBe(userSessionId);
  });
  test("reports an invalid UUID at the public Subject Identifier field", () => {
    const result = SessionManagementSessionVoSchema.safeParse(sessionVo("42"));

    expect(result.success).toBe(false);
    if (result.success)
      return;
    expect(result.error.issues).toEqual([
      expect.objectContaining({
        code: "invalid_format",
        format: "uuid",
        path: ["user", "subjectId"],
      }),
    ]);
  });
});
