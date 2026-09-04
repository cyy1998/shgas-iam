export const CLIENT_RUNTIME_SNAPSHOT_KINDS = [
  "oidc",
  "custom-sso",
  "traffic-gate",
] as const;

export type ClientRuntimeSnapshotKind = typeof CLIENT_RUNTIME_SNAPSHOT_KINDS[number];

export type ClientRuntimeSnapshot<T>
  = | { readonly kind: "present"; readonly value: T }
    | { readonly kind: "absent" };

export interface ClientRuntimeSnapshotCodec<T> {
  readonly encode: (value: unknown) => unknown;
  readonly decode: (payload: unknown) => T;
}

export interface ClientRuntimeSnapshotAdapter<
  K extends ClientRuntimeSnapshotKind,
  T,
> {
  readonly kind: K;
  readonly presentTtlMs: number;
  readonly absentTtlMs?: number;
  readonly load: (clientCode: string) => Promise<ClientRuntimeSnapshot<T>>;
  readonly codec: ClientRuntimeSnapshotCodec<T>;
}

export interface ClientRuntimeSnapshotReader<T> {
  readonly acquire: (clientCode: string) => Promise<ClientRuntimeSnapshot<T>>;
}

export class ClientRuntimeSnapshotUnavailableError extends Error {
  constructor() {
    super("Client Runtime Snapshot unavailable");
    this.name = "ClientRuntimeSnapshotUnavailableError";
  }
}

export class ClientRuntimeInvalidationFailedError extends Error {
  constructor() {
    super("Client Runtime invalidation failed");
    this.name = "ClientRuntimeInvalidationFailedError";
  }
}

export class ClientRuntimeRepairFailedError extends Error {
  constructor() {
    super("Client Runtime repair failed");
    this.name = "ClientRuntimeRepairFailedError";
  }
}

export class ClientRuntimeVerifyFailedError extends Error {
  constructor() {
    super("Client Runtime verify failed");
    this.name = "ClientRuntimeVerifyFailedError";
  }
}
