import type { ProfileV2MaintenancePageRow } from "./profile-v2-backfill";
import type { ProfileV2VerificationSummary } from "./profile-v2-inventory-gate";
import type { PublishedProfile } from "./profile.schema";
import { isDeepStrictEqual } from "node:util";
import { runProfileV2InventoryGate } from "./profile-v2-inventory-gate";

export function createProfileV2PostgresGate(deps: {
  repository: {
    readVerificationSummary: () => Promise<ProfileV2VerificationSummary>;
    scanPage: (input: {
      afterUserId: number;
      limit: number;
    }) => Promise<ProfileV2MaintenancePageRow[]>;
    rebuildExpected: (
      profiles: PublishedProfile[],
      observedAt: Date,
    ) => Promise<PublishedProfile[]>;
  };
  clock: { nowDate: () => Date };
}) {
  return {
    async verify(input: { version: 2; batchSize: number }) {
      const observedAt = deps.clock.nowDate();
      return await runProfileV2InventoryGate({
        ...input,
        gate: "postgres",
        observedAt,
        inventory: deps.repository,
        async checkPage(page, failures) {
          for (const row of page) {
            if (row.currentProfile === null)
              failures.add(row.profileIssue ?? "profile-v2-invalid", row.userId);
            else if (!row.backfillCompleted)
              failures.add("profile-backfill-marker-missing", row.userId);
          }
          const currentProfiles = page
            .map(row => row.currentProfile)
            .filter((profile): profile is PublishedProfile => profile !== null);
          const expectedProfiles = await deps.repository.rebuildExpected(
            currentProfiles,
            observedAt,
          );
          if (
            expectedProfiles.length !== currentProfiles.length
            || expectedProfiles.some((profile, index) =>
              profile.userId !== currentProfiles[index]!.userId)
          ) {
            throw new Error("Profile V2 PostgreSQL gate authoritative rebuild was incomplete");
          }
          currentProfiles.forEach((profile, index) => {
            if (!isDeepStrictEqual(withoutRebuiltAt(profile), withoutRebuiltAt(expectedProfiles[index]!))) {
              failures.add("profile-authoritative-mismatch", profile.userId);
            }
          });
        },
      });
    },
  };
}

function withoutRebuiltAt(profile: PublishedProfile) {
  const { rebuiltAt: _rebuiltAt, ...comparable } = profile;
  return comparable;
}
