import type { ProfileV2MaintenancePageRow } from "./profile-v2-backfill";
import {
  collectProfileV2SummaryFailures,
  createProfileV2GateFailureCollector,
} from "./profile-v2-gate-report";
import {
  assertSubjectProjectionPage,
  requirePositiveSafeInteger,
} from "./subject-projection-cutover.guards";

export interface ProfileV2VerificationSummary {
  userCount: number;
  profileCount: number;
  profileSubjectCount: number;
  distinctProfileSubjectCount: number;
  orphanProfileCount: number;
}

export interface ProfileV2InventoryGatePort {
  readVerificationSummary: () => Promise<ProfileV2VerificationSummary>;
  scanPage: (input: {
    afterUserId: number;
    limit: number;
  }) => Promise<ProfileV2MaintenancePageRow[]>;
}

export async function runProfileV2InventoryGate(input: {
  version: 2;
  gate: "postgres" | "redis-access";
  batchSize: number;
  observedAt: Date;
  inventory: ProfileV2InventoryGatePort;
  checkPage: (
    page: ProfileV2MaintenancePageRow[],
    failures: ReturnType<typeof createProfileV2GateFailureCollector>,
  ) => Promise<void>;
}) {
  requirePositiveSafeInteger(input.batchSize, "batchSize");
  const summary = await input.inventory.readVerificationSummary();
  const failures = createProfileV2GateFailureCollector();
  collectProfileV2SummaryFailures(summary, failures.add);
  let afterUserId = 0;
  let verifiedUsers = 0;
  while (true) {
    const page = await input.inventory.scanPage({
      afterUserId,
      limit: input.batchSize,
    });
    if (page.length === 0)
      break;
    assertSubjectProjectionPage(page, afterUserId, input.batchSize);
    verifiedUsers += page.length;
    await input.checkPage(page, failures);
    afterUserId = page.at(-1)!.userId;
    if (page.length < input.batchSize)
      break;
  }
  if (verifiedUsers !== summary.userCount) {
    failures.add(
      "verified-user-count-mismatch",
      undefined,
      Math.abs(summary.userCount - verifiedUsers),
    );
  }
  const report = failures.report();
  return {
    version: input.version,
    gate: input.gate,
    verifiedAt: input.observedAt.toISOString(),
    status: report.length === 0 ? "passed" as const : "failed" as const,
    counts: {
      users: summary.userCount,
      profiles: summary.profileCount,
      verifiedUsers,
    },
    failures: report,
  };
}
