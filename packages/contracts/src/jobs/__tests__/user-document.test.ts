import { describe, expect, test } from "bun:test";
import {
  MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE,
  RebuildUserDocumentJobPayloadSchema,
  RebuildUserDocumentsBatchJobPayloadSchema,
  USER_DOCUMENT_QUEUE_NAME,
  UserDocumentJobNameSchema,
  UserDocumentRebuildReason,
} from "../user-document";

describe("user-document job contract", () => {
  test("accepts bounded batches with exact per-target versions and rejects oversized or empty wakes", () => {
    const request = { userId: 123, version: "9007199254740993", reason: UserDocumentRebuildReason.UserUpdated };
    const accepted = RebuildUserDocumentsBatchJobPayloadSchema.parse({ requests: [request] });
    expect(accepted.requests).toEqual([request]);
    for (const requests of [[], Array.from({ length: MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE + 1 }, () => request)]) {
      expect(RebuildUserDocumentsBatchJobPayloadSchema.safeParse({ requests }).success).toBe(false);
    }
    expect(RebuildUserDocumentsBatchJobPayloadSchema.safeParse({ requests: [request], version: "1" }).success).toBe(
      false,
    );
  });

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
