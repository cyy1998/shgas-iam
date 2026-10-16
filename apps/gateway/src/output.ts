import type { ChangePlan, PlannedChange } from "./types";

export function serializePlan(plan: ChangePlan): Record<string, unknown> {
  return {
    creates: serializeChanges(plan.creates),
    updates: serializeChanges(plan.updates),
    deletes: serializeChanges(plan.deletes),
    ignored: plan.ignored.map((change) => ({
      kind: change.kind,
      id: change.id,
      reason: change.reason,
    })),
  };
}

function serializeChanges(changes: PlannedChange[]): Array<Pick<PlannedChange, "kind" | "id">> {
  return changes.map((change) => ({ kind: change.kind, id: change.id }));
}
