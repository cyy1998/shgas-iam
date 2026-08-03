import type {
  AuthorizationGrantBeginResult,
  AuthorizationGrantRedemptionRecord,
  AuthorizationGrantRenewResult,
  AuthorizationGrantReservation,
} from "./model";

export interface AuthorizationGrantRedemptionStore {
  readonly initialize: (
    record: Extract<AuthorizationGrantRedemptionRecord, { state: "issued" }>,
  ) => Promise<"created" | "exists" | "expired">;
  readonly begin: (input: {
    readonly attemptId: string;
    readonly grantId: string;
    readonly leaseDurationMs: number;
  }) => Promise<AuthorizationGrantBeginResult>;
  readonly renew: (input: {
    readonly leaseDurationMs: number;
    readonly reservation: AuthorizationGrantReservation;
  }) => Promise<AuthorizationGrantRenewResult>;
  readonly release: (
    reservation: AuthorizationGrantReservation,
  ) => Promise<
    | "released"
    | "stale-attempt"
    | "lease-expired"
    | "consumed"
    | "expired"
    | "invalid"
    | "missing"
  >;
  readonly consume: (
    reservation: AuthorizationGrantReservation,
  ) => Promise<
    | "consumed"
    | "already-consumed"
    | "stale-attempt"
    | "lease-expired"
    | "expired"
    | "invalid"
    | "missing"
  >;
}
