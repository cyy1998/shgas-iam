import { BAD_GATEWAY, SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { ApisixWriteError } from "../../apisix.error";
import { serializePlan } from "../../output";
import { sortChanges } from "../../planner";
import { deleteOrder, writeOrder } from "../../resources";
import type { ChangePlan, ManifestObject, PlannedChange } from "../../types";
import { GatewayError } from "./gateway.error";
import type { GatewayRemoteWriter } from "./gateway.port";
import { writableSnapshot } from "./gateway-snapshot";

type Target = PlannedChange & { before?: ManifestObject; after?: ManifestObject };

export async function publishGatewayPlan(input: {
  writer: GatewayRemoteWriter;
  plan: ChangePlan;
  prune: boolean;
  signal: AbortSignal;
  block(): void;
}) {
  const { writer, plan, signal } = input;
  const targets: Target[] = [
    ...sortChanges([...plan.creates, ...plan.updates], writeOrder),
    ...(input.prune ? sortChanges(plan.deletes, deleteOrder) : []),
  ].map((change) => ({
    ...change,
    before: change.remote === undefined ? undefined : writableSnapshot(change, change.remote),
    after: change.desired === undefined ? undefined : writableSnapshot(change, change.desired),
  }));
  try {
    await writer.assertRestorableDeletions(input.prune ? plan.deletes : [], signal);
  } catch {
    throw new GatewayError(
      "GATEWAY_SNAPSHOT_INVALID",
      "Deletion requires a complete restorable snapshot without consumer credential children",
      BAD_GATEWAY,
    );
  }
  const attempted: Target[] = [];
  try {
    for (const target of targets) {
      signal.throwIfAborted();
      attempted.push(target);
      if (target.after) await writer.upsert(target.kind, target.id, target.after, signal);
      else await writer.delete(target.kind, target.id, signal);
    }
    return {
      outcome: attempted.length ? "applied" : "no_change",
      written: attempted.length > 0,
      dryRun: false,
      prune: input.prune,
      plan: serializePlan(plan),
    };
  } catch (error) {
    if (!attempted.length)
      throw new GatewayError(
        "GATEWAY_REMOTE_UNAVAILABLE",
        "Publishing did not start before its deadline",
        SERVICE_UNAVAILABLE,
      );
    let unknown = signal.aborted || !(error instanceof ApisixWriteError) || error.effect === "unknown";
    let failed = false;
    const restore = sortChanges(
      attempted.filter((target) => target.before),
      writeOrder,
    );
    const remove = sortChanges(
      attempted.filter((target) => !target.before),
      deleteOrder,
    );
    for (const target of [...restore, ...remove]) {
      if (signal.aborted) {
        unknown = true;
        break;
      }
      try {
        const before = target.before;
        if (before) await writer.upsert(target.kind, target.id, before, signal);
        else await writer.delete(target.kind, target.id, signal);
      } catch (failure) {
        if (!(failure instanceof ApisixWriteError) || failure.effect === "unknown") unknown = true;
        else failed = true;
      }
    }
    const outcome = unknown ? "unknown" : failed ? "rollback_failed" : "rolled_back";
    if (outcome !== "rolled_back") input.block();
    throw new GatewayError(
      unknown ? "GATEWAY_APPLY_UNKNOWN" : failed ? "GATEWAY_ROLLBACK_FAILED" : "GATEWAY_APPLY_ROLLED_BACK",
      unknown
        ? "Publishing outcome is unknown; manual recovery is required"
        : failed
          ? "Publishing and recovery failed; manual recovery is required"
          : "Publishing failed and was rolled back",
      outcome === "rolled_back" ? BAD_GATEWAY : SERVICE_UNAVAILABLE,
      { outcome, writeAttempted: true, plan: serializePlan(plan) },
    );
  }
}
