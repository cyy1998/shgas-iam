import type { EmploymentCutoverVerifyCommandReport } from "@worker/commands/employment-cutover-verifier";
import { runEmploymentCutoverVerifyCommand } from "@worker/commands/employment-cutover-verifier";
import { describe, expect, mock, test } from "bun:test";

describe("Employment cutover verifier command", () => {
  test("returns and logs the complete read-only verification report", async () => {
    const report = {
      version: 1 as const,
      verifiedAt: "2026-08-11T12:00:00.000Z",
      status: "failed" as const,
      counts: {
        employments: 2,
        legacyTombstones: 1,
        blockingEmployments: 1,
      },
      failures: [{
        code: "unknown-employment-status",
        count: 1,
        employmentIds: [41],
      }],
    } satisfies EmploymentCutoverVerifyCommandReport;
    const verify = mock(async () => report);
    const info = mock(() => {});

    expect(await runEmploymentCutoverVerifyCommand({
      verifier: { verify },
      logger: { info },
    })).toEqual(report);
    expect(info).toHaveBeenNthCalledWith(
      1,
      {},
      "Employment cutover verification started",
    );
    expect(info).toHaveBeenNthCalledWith(
      2,
      report,
      "Employment cutover verification completed",
    );
  });
});
