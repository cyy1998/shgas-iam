import { expect, test } from "bun:test";
import { runOrganizationDocumentRepairCommand } from "@worker/commands/organization-document/organization-document-repair";

test("repair reports stage wakeups separately from publication and fails a partially delivered batch", async () => {
  const report = {
    enqueued: 2,
    failed: 1,
    outbox: { selected: 2, enqueued: 1, failed: 1 },
    rebuilds: { selected: 1, enqueued: 1, failed: 0 },
  };
  const observed: Record<string, unknown>[] = [];
  const result = await runOrganizationDocumentRepairCommand(
    {
      processor: {
        async repairFailedOrStale() {
          return report;
        },
      },
      logger: {
        info(data) {
          observed.push(data);
        },
      },
    },
    { staleBefore: new Date(0), limit: 10 },
  );
  expect(result).toMatchObject({ ...report, status: "failed", publication: "not-verified" });
  expect(observed[0]).toMatchObject({
    status: "failed",
    outbox: report.outbox,
    rebuilds: report.rebuilds,
  });
});
