export type SubjectFactsReaderObservation
  = | {
    readonly operation: "cache-read";
    readonly outcome: "hit" | "invalid" | "miss";
    readonly durationMs: number;
  }
  | {
    readonly operation: "profile-load";
    readonly outcome: "error" | "not-ready" | "ready";
    readonly durationMs: number;
  }
  | {
    readonly operation: "single-flight-wait";
    readonly outcome: "joined";
    readonly durationMs: number;
  };

export interface SubjectFactsReaderObservabilityPort {
  readonly record: (observation: SubjectFactsReaderObservation) => void;
}
