import type { SubjectAccessRecordV1 } from "@iam/api-core/subject-access";
import type { SubjectFactsCacheRecord } from "./profile-cache";
import type { ProfileV2InventoryGatePort } from "./profile-v2-inventory-gate";
import { isDeepStrictEqual } from "node:util";
import { createSubjectFactsCacheRecord } from "./profile-cache";
import { runProfileV2InventoryGate } from "./profile-v2-inventory-gate";

type InspectionResult<T>
  = | { status: "invalid" | "missing" }
    | { status: "valid"; record: T };

export function createProfileV2RedisAccessGate(deps: {
  inventory: ProfileV2InventoryGatePort;
  subjectFacts: {
    inspectMany: (
      subjectIdentifiers: string[],
    ) => Promise<Array<InspectionResult<SubjectFactsCacheRecord>>>;
  };
  subjectAccess: {
    inspectMany: (
      subjectIdentifiers: string[],
    ) => Promise<Array<InspectionResult<SubjectAccessRecordV1>>>;
  };
  clock: { nowDate: () => Date };
}) {
  return {
    async verify(input: { version: 2; batchSize: number }) {
      const observedAt = deps.clock.nowDate();
      return await runProfileV2InventoryGate({
        ...input,
        gate: "redis-access",
        observedAt,
        inventory: deps.inventory,
        async checkPage(page, failures) {
          const subjectIdentifiers = page.map(row => row.subjectIdentifier);
          const facts = await deps.subjectFacts.inspectMany(subjectIdentifiers);
          const access = await deps.subjectAccess.inspectMany(subjectIdentifiers);
          if (facts.length !== page.length || access.length !== page.length)
            throw new Error("Profile V2 Redis gate inspection returned an incomplete batch");
          page.forEach((row, index) => {
            if (row.currentProfile !== null && !row.backfillCompleted)
              failures.add("profile-backfill-marker-missing", row.userId);
            const factsResult = facts[index]!;
            if (factsResult.status !== "valid") {
              failures.add(`facts-${factsResult.status}`, row.userId);
            }
            else if (row.currentProfile === null) {
              failures.add("facts-without-current-profile", row.userId);
            }
            else {
              const expected = createSubjectFactsCacheRecord(
                row.currentProfile,
                row.currentProfile.rebuiltAt,
              );
              if (!isDeepStrictEqual(factsResult.record, expected))
                failures.add("facts-mismatch", row.userId);
            }

            const accessResult = access[index]!;
            if (accessResult.status !== "valid") {
              failures.add(`barrier-${accessResult.status}`, row.userId);
            }
            else if (
              accessResult.record.subjectIdentifier !== row.subjectIdentifier
              || accessResult.record.state !== (row.accountAvailable ? "enabled" : "disabled")
            ) {
              failures.add("barrier-state-mismatch", row.userId);
            }
          });
        },
      });
    },
  };
}
