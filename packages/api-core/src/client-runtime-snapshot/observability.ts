import type { ClientRuntimeSnapshotKind } from "./contract";
import { SystemLogEvent } from "../logger";

export type ClientRuntimeSnapshotObservation
  = | {
    readonly operation: "acquire";
    readonly outcome: "hit" | "loaded-present" | "loaded-absent" | "unavailable";
    readonly durationMs: number;
    readonly kind: ClientRuntimeSnapshotKind;
  }
  | {
    readonly operation: "bootstrap";
    readonly outcome: "created";
    readonly durationMs: number;
    readonly kind: ClientRuntimeSnapshotKind;
  }
  | {
    readonly operation: "publish";
    readonly outcome: "published" | "conflict" | "verified";
    readonly durationMs: number;
    readonly kind: ClientRuntimeSnapshotKind;
  }
  | {
    readonly operation: "invalidate";
    readonly outcome: "completed" | "failed";
    readonly durationMs: number;
  }
  | {
    readonly operation: "repair-client";
    readonly outcome: "completed" | "failed";
    readonly durationMs: number;
    readonly clientCode: string;
  }
  | {
    readonly operation: "repair-all" | "verify-all";
    readonly outcome: "completed" | "failed";
    readonly durationMs: number;
  };

export interface ClientRuntimeSnapshotObservabilityPort {
  readonly record: (observation: ClientRuntimeSnapshotObservation) => void;
}

export interface ClientRuntimeSnapshotObservabilityLogger {
  readonly info: (
    fields: Record<string, unknown>,
    message: string,
  ) => void;
}

export function createClientRuntimeSnapshotLoggerObservability(
  logger: ClientRuntimeSnapshotObservabilityLogger,
): ClientRuntimeSnapshotObservabilityPort {
  return {
    record(observation) {
      logger.info({
        event: SystemLogEvent.ClientRuntimeSnapshotOperationObserved,
        operation: observation.operation,
        outcome: observation.outcome,
        durationMs: normalizeDuration(observation.durationMs),
        ...(
          observation.operation === "acquire"
          || observation.operation === "bootstrap"
          || observation.operation === "publish"
            ? { kind: observation.kind }
            : {}
        ),
        ...(observation.operation === "repair-client"
          ? { clientCode: observation.clientCode }
          : {}),
      }, "Client Runtime Snapshot operation observed");
    },
  };
}

function normalizeDuration(durationMs: number) {
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
}
