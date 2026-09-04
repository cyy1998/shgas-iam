import type { ClientRuntimeSnapshotKind } from "./contract";

export interface ClientRuntimeSnapshotControl {
  readonly epoch: string;
  readonly generation: string;
}

export interface ClientRuntimeSnapshotAcquisitionState {
  readonly control: ClientRuntimeSnapshotControl;
  readonly payload: string | null;
  readonly bootstrapped: boolean;
}

export interface ClientRuntimeSnapshotAtomicStore {
  readonly readOrBootstrap: (
    clientCode: string,
    kind: ClientRuntimeSnapshotKind,
    candidateEpoch: string,
  ) => Promise<ClientRuntimeSnapshotAcquisitionState>;
  readonly publishIfCurrent: (
    clientCode: string,
    kind: ClientRuntimeSnapshotKind,
    control: ClientRuntimeSnapshotControl,
    payload: string,
    ttlMs: number,
  ) => Promise<"conflict" | "published">;
  readonly verifyCurrent: (
    clientCode: string,
    control: ClientRuntimeSnapshotControl,
  ) => Promise<"conflict" | "verified">;
  readonly invalidateClient: (
    clientCode: string,
    candidateEpoch: string,
  ) => Promise<void>;
}
