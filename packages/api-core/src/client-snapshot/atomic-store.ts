type ClientSnapshotKind = "client" | "credential";

export interface ClientSnapshotControl {
  readonly epoch: string;
  readonly generation: string;
}

export interface ClientSnapshotAcquisitionState {
  readonly control: ClientSnapshotControl;
  readonly payload: string | null;
  readonly bootstrapped: boolean;
}

export interface ClientSnapshotAtomicStore {
  readonly readOrBootstrap: (
    clientCode: string,
    kind: ClientSnapshotKind,
    candidateEpoch: string,
  ) => Promise<ClientSnapshotAcquisitionState>;
  readonly publishIfCurrent: (
    clientCode: string,
    kind: ClientSnapshotKind,
    control: ClientSnapshotControl,
    payload: string,
    ttlMs: number,
  ) => Promise<"conflict" | "published">;
  readonly invalidateClient: (
    clientCode: string,
    candidateEpoch: string,
  ) => Promise<void>;
}
