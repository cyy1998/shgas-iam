export class ApisixReadError extends Error {
  constructor(readonly code: "APISIX_READ_INVALID" | "APISIX_READ_UNAVAILABLE") {
    super(
      code === "APISIX_READ_INVALID"
        ? "APISIX returned an invalid or incomplete resource list"
        : "APISIX resource reading failed",
    );
  }
}

export class ApisixWriteError extends Error {
  constructor(readonly effect: "rejected" | "unknown") {
    super(
      effect === "rejected" ? "APISIX rejected a configuration write" : "APISIX configuration write outcome is unknown",
    );
  }
}
