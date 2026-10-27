import { describe, expect, test } from "bun:test";
import {
  RebuildUserDocumentJobPayloadSchema,
  USER_DOCUMENT_QUEUE_NAME,
  UserDocumentJobNameSchema,
} from "../user-document";

describe("user-document job contract", () => {
  test("defines the stable rebuild queue and job name", () => {
    expect(USER_DOCUMENT_QUEUE_NAME).toBe("user-document");
    const result = UserDocumentJobNameSchema.safeParse("rebuild-user-document");

    expect(result.success).toBe(true);
    if (!result.success) throw result.error;
    expect(String(result.data)).toBe("rebuild-user-document");
  });

  test("validates rebuild payloads before enqueueing or processing", () => {
    const result = RebuildUserDocumentJobPayloadSchema.safeParse({
      userId: 123,
      version: "42",
      reason: "user-updated",
      requestedAt: "2026-07-25T10:30:00.000Z",
      requestId: "req-1",
      traceId: "trace-1",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw result.error;
    expect({
      ...result.data,
      reason: String(result.data.reason),
    }).toEqual({
      userId: 123,
      version: "42",
      reason: "user-updated",
      requestedAt: "2026-07-25T10:30:00.000Z",
      requestId: "req-1",
      traceId: "trace-1",
    });

    expect(
      RebuildUserDocumentJobPayloadSchema.safeParse({
        userId: 0,
        version: "1",
        reason: "user-updated",
      }).success,
    ).toBe(false);

    expect(
      RebuildUserDocumentJobPayloadSchema.safeParse({
        userId: 123,
        version: "not-decimal",
        reason: "user-updated",
      }).success,
    ).toBe(false);

    expect(
      RebuildUserDocumentJobPayloadSchema.safeParse({
        userId: 123,
        version: "0",
        reason: "user-updated",
      }).success,
    ).toBe(false);

    expect(
      RebuildUserDocumentJobPayloadSchema.safeParse({
        userId: 123,
      }).success,
    ).toBe(false);

    for (const schemaVersion of [1, 2]) {
      expect(
        RebuildUserDocumentJobPayloadSchema.safeParse({
          userId: 123,
          version: "42",
          reason: "user-updated",
          schemaVersion,
        }).success,
      ).toBe(false);
    }
  });
});
