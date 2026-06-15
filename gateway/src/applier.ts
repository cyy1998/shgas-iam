import type { ApisixAdminClient } from "./apisix-admin-client";
import type { AppliedChange, ApplyResult, ChangePlan } from "./types";
import { sortChanges } from "./planner";
import { deleteOrder, writeOrder } from "./resources";

export async function applyPlan(
  client: Pick<ApisixAdminClient, "upsert" | "delete">,
  plan: ChangePlan,
  options: { dryRun: boolean; prune: boolean },
): Promise<ApplyResult> {
  const applied: AppliedChange[] = [];

  if (!options.dryRun) {
    for (const change of sortChanges(plan.creates, writeOrder)) {
      await client.upsert(change.kind, change.id, change.desired ?? {});
      applied.push({ ...change, action: "create" });
    }

    for (const change of sortChanges(plan.updates, writeOrder)) {
      await client.upsert(change.kind, change.id, change.desired ?? {});
      applied.push({ ...change, action: "update" });
    }

    if (options.prune) {
      for (const change of sortChanges(plan.deletes, deleteOrder)) {
        await client.delete(change.kind, change.id);
        applied.push({ ...change, action: "delete" });
      }
    }
  }

  return {
    plan,
    dryRun: options.dryRun,
    prune: options.prune,
    applied,
  };
}
