import { describe, expect, test } from "bun:test";
import { AUDIT_REDACTED_VALUE, normalizeAuditActor, redactAuditDetails } from "../helpers";
import { maskMobileForAudit } from "../masking";

describe("audit actor normalization", () => {
  test("requires user actors to have a user id or username", () => {
    expect(() => normalizeAuditActor({
      actorType: "user",
      actorUserId: null,
      actorUsername: null,
      actorClientCode: null,
      actorSystemKey: null,
    })).toThrow("user/admin actor requires actorUserId or actorUsername");
  });

  test("clears irrelevant actor identifiers", () => {
    expect(normalizeAuditActor({
      actorType: "client",
      actorUserId: 1,
      actorUsername: "admin",
      actorClientCode: "portal",
      actorSystemKey: "job",
    })).toEqual({
      actorType: "client",
      actorUserId: null,
      actorUsername: null,
      actorClientCode: "portal",
      actorSystemKey: null,
    });
  });
});

describe("audit detail redaction", () => {
  test("redacts sensitive fields recursively without hiding safe code fields", () => {
    expect(redactAuditDetails({
      password: "plain",
      token: "token",
      before: {
        clientCode: "portal",
        clientSecret: "secret",
        errorCode: "E_BAD_INPUT",
      },
      users: [
        { name: "alice", cookie: "sid=1" },
      ],
    })).toEqual({
      password: AUDIT_REDACTED_VALUE,
      token: AUDIT_REDACTED_VALUE,
      before: {
        clientCode: "portal",
        clientSecret: AUDIT_REDACTED_VALUE,
        errorCode: "E_BAD_INPUT",
      },
      users: [
        { name: "alice", cookie: AUDIT_REDACTED_VALUE },
      ],
    });
  });
});

describe("audit masking helpers", () => {
  test("masks mobile numbers for audit details", () => {
    expect(maskMobileForAudit("17721462865")).toBe("177****2865");
  });

  test("passes through non-matching values and keeps nullish values null", () => {
    expect(maskMobileForAudit("bad-phone")).toBe("bad-phone");
    expect(maskMobileForAudit(null)).toBeNull();
    expect(maskMobileForAudit(undefined)).toBeNull();
  });
});
