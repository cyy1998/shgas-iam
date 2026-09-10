import type {
  LifecycleObjectKind,
  RevokedTombstone,
  RevokeObjectCounter,
  RevokeSummary,
} from "./model";

export type ResolvedResult<T> = {
  status: "resolved";
  value: T;
  /** Redis acquisition time in milliseconds; deadline consumers must use this observation, not their local clock. */
  observedAt: number;
};

export type RevokedResult = {
  status: "revoked";
  tombstone: RevokedTombstone;
};

export type MissingOrExpiredResult = {
  status: "missing_or_expired";
};

export type SchemaInvalidResult = {
  status: "schema_invalid";
  objectKind: LifecycleObjectKind;
  objectId?: string;
  issues?: unknown;
};

export type ConsumedReplayResult = {
  status: "consumed_replay";
  tombstone: RevokedTombstone;
};

export type FailClosedResult = {
  status: "fail_closed";
  message: string;
  cause?: unknown;
};

export type LifecycleFailureResult
  = | { status: "purpose_mismatch" }
    | RevokedResult
    | MissingOrExpiredResult
    | SchemaInvalidResult
    | ConsumedReplayResult
    | FailClosedResult;

export type ResolveResult<T>
  = | ResolvedResult<T>
    | LifecycleFailureResult;

export type CreateResult<T>
  = | { status: "created"; value: T; observedAt: number; externalToken?: string }
    | LifecycleFailureResult;

export function failClosed(message: string, cause?: unknown): FailClosedResult {
  return { status: "fail_closed", message, cause };
}

function emptyCounter(): RevokeObjectCounter {
  return { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 };
}

export function createEmptyRevokeSummary(): RevokeSummary {
  return {
    principalSessions: emptyCounter(),
    bindings: emptyCounter(),
    credentials: emptyCounter(),
    artifacts: emptyCounter(),
    cleanup: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      failures: [],
    },
  };
}

export function mergeRevokeSummary(target: RevokeSummary, source: RevokeSummary) {
  mergeCounter(target.principalSessions, source.principalSessions);
  mergeCounter(target.bindings, source.bindings);
  mergeCounter(target.credentials, source.credentials);
  mergeCounter(target.artifacts, source.artifacts);
  target.cleanup.attempted += source.cleanup.attempted;
  target.cleanup.succeeded += source.cleanup.succeeded;
  target.cleanup.failed += source.cleanup.failed;
  target.cleanup.failures.push(...source.cleanup.failures);
  return target;
}

function mergeCounter(target: RevokeObjectCounter, source: RevokeObjectCounter) {
  target.revoked += source.revoked;
  target.alreadyRevoked += source.alreadyRevoked;
  target.missing += source.missing;
  target.excluded += source.excluded;
}

export function counterForKind(summary: RevokeSummary, kind: LifecycleObjectKind): RevokeObjectCounter {
  switch (kind) {
    case "principal_session":
      return summary.principalSessions;
    case "client_binding":
      return summary.bindings;
    case "credential":
      return summary.credentials;
    case "artifact":
      return summary.artifacts;
  }
}
