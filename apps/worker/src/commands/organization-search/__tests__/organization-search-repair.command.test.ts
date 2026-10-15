import { expect, test } from "bun:test";
import { runOrganizationSearchRepairCommand } from "@worker/commands/organization-search/organization-search-repair";

test("repair reports stage wakeups separately from publication and fails a partially delivered batch", async () => {
  const report = {
    enqueued: 2,
    failed: 1,
    sourceChanges: { selected: 2, enqueued: 1, failed: 1 },
    rebuilds: { selected: 1, enqueued: 1, failed: 0 },
  };
  const observed: Record<string, unknown>[] = [];
  const result = await runOrganizationSearchRepairCommand(
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
    sourceChanges: report.sourceChanges,
    rebuilds: report.rebuilds,
  });
});
