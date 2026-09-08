export interface AuthorizationGrantReservation {
  readonly grantId: string;
  readonly attemptId: string;
  readonly leaseExpiresAt: number;
  readonly expiresAt: number;
}

export type AuthorizationGrantBeginResult
  = | {
    readonly status: "reserved";
    readonly reservation: AuthorizationGrantReservation;
  }
  | {
    readonly status: "busy";
    readonly leaseExpiresAt: number;
  }
  | {
    readonly status: "consumed" | "expired" | "invalid" | "missing";
  };

export type AuthorizationGrantRenewResult
  = | {
    readonly status: "renewed";
    readonly reservation: AuthorizationGrantReservation;
  }
  | {
    readonly status:
      | "stale-attempt"
      | "lease-expired"
      | "consumed"
      | "expired"
      | "invalid"
      | "missing";
  };

export type AuthorizationGrantRedemptionRecord
  = | {
    readonly version: 1;
    readonly grantId: string;
    readonly state: "issued";
    readonly expiresAt: number;
  }
  | {
    readonly version: 1;
    readonly grantId: string;
    readonly state: "redeeming";
    readonly attemptId: string;
    readonly leaseExpiresAt: number;
    readonly expiresAt: number;
  }
  | {
    readonly version: 1;
    readonly grantId: string;
    readonly state: "consumed";
    readonly expiresAt: number;
  };
