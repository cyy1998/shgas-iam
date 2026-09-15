import type { RevocationResult } from "@iam/session-kernel";
import type { OidcAuthorizationResponse } from "./wire";

export class OidcProtocolError extends Error {
  constructor(
    readonly errorCode: string,
    readonly description: string,
    readonly status: 400 | 401 | 503 = 400,
    readonly response?: OidcAuthorizationResponse,
    readonly clearGlobalSessionCookie = false,
  ) {
    super(description);
    this.name = "OidcProtocolError";
  }
}

export type OidcCodeConsumption = "not_attempted" | "consumed" | "missing" | "unknown";

/** Internal operation evidence; transport keeps the standard OAuth error body. */
export class OidcExchangeFailure extends Error {
  constructor(
    readonly failure: unknown,
    readonly consumption: OidcCodeConsumption,
    readonly revocation: RevocationResult,
  ) {
    super("OIDC exchange failed", { cause: failure });
    this.name = "OidcExchangeFailure";
  }
}

export class OidcStateUnavailableError extends Error {
  constructor(readonly outcome: "unknown" | "corrupt" = "unknown") {
    super("OIDC state unavailable");
    this.name = "OidcStateUnavailableError";
  }
}
