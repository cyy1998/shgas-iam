import { describe, expect, test } from "bun:test";
import {
  SubjectAccessDisabledError,
  translateSubjectAccessResolveResult,
} from "../index";

describe("Subject Access Session Kernel result translation", () => {
  for (const reason of [
    "user_disabled",
    "user_deleted",
    "session_generation_stale",
  ] as const) {
    test(`maps ${reason} to the neutral disabled-domain error`, () => {
      expect(() => translateSubjectAccessResolveResult({
        status: "validation_failed",
        reason,
      })).toThrow(SubjectAccessDisabledError);
    });
  }

  test("preserves non-subject results unchanged", () => {
    const result = {
      status: "validation_failed" as const,
      reason: "client_disabled" as const,
    };
    expect(translateSubjectAccessResolveResult(result)).toBe(result);
  });
});
