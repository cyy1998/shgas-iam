import type {
  SubjectFactsReaderObservabilityPort,
  SubjectFactsReaderObservation,
} from "./subject-facts-observability.contract";
import { SystemLogEvent } from "@iam/api-core/logger";

export type {
  SubjectFactsReaderObservabilityPort,
  SubjectFactsReaderObservation,
} from "./subject-facts-observability.contract";

export interface SubjectFactsObservabilityLogger {
  readonly info: (
    fields: Record<string, unknown>,
    message: string,
  ) => void;
}

export function createSubjectFactsLoggerObservability(
  logger: SubjectFactsObservabilityLogger,
): SubjectFactsReaderObservabilityPort {
  return {
    record(observation: SubjectFactsReaderObservation) {
      logger.info({
        event: SystemLogEvent.SubjectFactsOperationObserved,
        operation: observation.operation,
        outcome: observation.outcome,
        durationMs: normalizeDuration(observation.durationMs),
      }, "Subject Facts operation observed");
    },
  };
}

function normalizeDuration(durationMs: number) {
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
}
