import { describe, expect, mock, test } from "bun:test";
import { runUserDocumentBackfillCommand } from "../user-document-backfill";
import { parseUserDocumentRepairArgs } from "../user-document-repair";

describe("user-document commands", () => {
  test.each(
    [
      ["--retry-user-id", "1"],
      ["--retry-version", "1"],
      ["--retry-user-id", "0", "--retry-version", "1"],
      ["--retry-user-id", "1", "--retry-version", "01"],
      ["--retry-user-id", "1", "--retry-version", "1", "--subject-access-only"],
      ["--force", "--subject-access-only"],
      ["--force", "--retry-user-id", "1", "--retry-version", "1"],
    ].map((argv) => ({ argv })),
  )("explicit retry rejects invalid argv %j before creating resources", ({ argv }) => {
    expect(() => parseUserDocumentRepairArgs(argv)).toThrow(RangeError);
  });

  test("explicit retry argv preserves a bigint version without rounding", () => {
    expect(parseUserDocumentRepairArgs(["--retry-user-id", "7", "--retry-version", "9007199254740993"])).toMatchObject({
      retryPostPublication: { userId: 7, version: "9007199254740993" },
    });
  });

  test("force argv selects bounded bulk repair", () => {
    expect(parseUserDocumentRepairArgs(["--force", "--limit", "20"])).toMatchObject({ force: true, limit: 20 });
  });

  test("backfill command delegates to worker maintenance", async () => {
    const backfillAllUsers = mock(async () => ({ registered: 3, enqueued: 3 }));
    const info = mock(() => {});

    await expect(
      runUserDocumentBackfillCommand({
        maintenance: { backfillAllUsers },
        logger: { info },
        config: { batchSize: 25 },
      }),
    ).resolves.toEqual({ registered: 3, enqueued: 3 });

    expect(backfillAllUsers).toHaveBeenCalledWith({ batchSize: 25 });
    expect(info).toHaveBeenCalledWith(
      {
        registered: 3,
        enqueued: 3,
        publication: "not-verified",
      },
      "User Document backfill registered; wait for publication and run verification",
    );
  });
});
