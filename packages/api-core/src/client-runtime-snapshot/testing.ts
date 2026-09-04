import type {
  ClientRuntimeSnapshotAtomicStore,
  ClientRuntimeSnapshotControl,
} from "./atomic-store";
import type { ClientRuntimeSnapshotKind } from "./contract";
import { CLIENT_RUNTIME_SNAPSHOT_KINDS } from "./contract";

export type {
  ClientRuntimeSnapshotAcquisitionState,
  ClientRuntimeSnapshotAtomicStore,
  ClientRuntimeSnapshotControl,
} from "./atomic-store";
export {
  createClientRuntimeSnapshotMaintenanceWithAtomicStore,
  createClientRuntimeSnapshotRestoreRepairWithInventory,
  createClientRuntimeSnapshotVerifierWithInventory,
} from "./client-runtime-maintenance";
export type {
  CreateClientRuntimeSnapshotMaintenanceWithAtomicStoreOptions,
} from "./client-runtime-maintenance";
export {
  createClientRuntimeSnapshotModuleWithAtomicStore,
} from "./client-runtime-snapshot";
export type {
  CreateClientRuntimeSnapshotModuleWithAtomicStoreOptions,
} from "./client-runtime-snapshot";
export { CLIENT_RUNTIME_SNAPSHOT_RESTORE_CLEANUP_PATTERNS } from "./legacy-restore-cleanup-inventory";
export { clientRuntimeSnapshotTestingKeys } from "./redis-store";
export {
  createClientRuntimeRestoreInventoryReaderForTesting,
  createClientRuntimeRestoreInventoryRepairerForTesting,
} from "./restore-inventory";
export type {
  ClientRuntimeRestoreInventoryReader,
  ClientRuntimeRestoreInventoryRepairer,
} from "./restore-inventory";

export class InMemoryClientRuntimeSnapshotAtomicStore implements ClientRuntimeSnapshotAtomicStore {
  private readonly controls = new Map<string, ClientRuntimeSnapshotControl>();
  private readonly payloads = new Map<string, string>();

  readonly publishedTtls: number[] = [];
  beforePublish?: (
    store: InMemoryClientRuntimeSnapshotAtomicStore,
    publishCount: number,
  ) => void;

  publishCount = 0;
  bootstrapCount = 0;

  async readOrBootstrap(
    clientCode: string,
    kind: ClientRuntimeSnapshotKind,
    candidateEpoch: string,
  ) {
    let control = this.controls.get(clientCode);
    const bootstrapped = control === undefined;
    if (control === undefined) {
      control = { epoch: candidateEpoch, generation: "0" };
      this.controls.set(clientCode, control);
      this.deletePayloads(clientCode);
      this.bootstrapCount += 1;
    }
    return {
      bootstrapped,
      control,
      payload: this.payloads.get(this.payloadIdentity(clientCode, kind)) ?? null,
    };
  }

  async publishIfCurrent(
    clientCode: string,
    kind: ClientRuntimeSnapshotKind,
    expected: ClientRuntimeSnapshotControl,
    payload: string,
    ttlMs: number,
  ) {
    this.publishCount += 1;
    this.beforePublish?.(this, this.publishCount);
    const control = this.controls.get(clientCode);
    if (control?.epoch !== expected.epoch
      || control.generation !== expected.generation) {
      return "conflict" as const;
    }
    const identity = this.payloadIdentity(clientCode, kind);
    this.payloads.set(identity, payload);
    this.publishedTtls.push(ttlMs);
    return "published" as const;
  }

  async verifyCurrent(
    clientCode: string,
    expected: ClientRuntimeSnapshotControl,
  ) {
    this.publishCount += 1;
    this.beforePublish?.(this, this.publishCount);
    const control = this.controls.get(clientCode);
    return control?.epoch === expected.epoch
      && control.generation === expected.generation
      ? "verified" as const
      : "conflict" as const;
  }

  async invalidateClient(clientCode: string, candidateEpoch: string) {
    const control = this.controls.get(clientCode);
    this.controls.set(clientCode, control
      ? { ...control, generation: String(BigInt(control.generation) + 1n) }
      : { epoch: candidateEpoch, generation: "0" });
    this.deletePayloads(clientCode);
  }

  advanceGeneration(clientCode: string) {
    const control = this.controls.get(clientCode);
    if (control === undefined)
      throw new Error("Client Runtime Snapshot control is missing");
    this.controls.set(clientCode, {
      ...control,
      generation: String(BigInt(control.generation) + 1n),
    });
  }

  replaceEpoch(clientCode: string, epoch: string) {
    const control = this.controls.get(clientCode);
    if (control === undefined)
      throw new Error("Client Runtime Snapshot control is missing");
    this.controls.set(clientCode, { ...control, epoch });
  }

  private deletePayloads(clientCode: string) {
    for (const kind of CLIENT_RUNTIME_SNAPSHOT_KINDS) {
      const identity = this.payloadIdentity(clientCode, kind);
      this.payloads.delete(identity);
    }
  }

  private payloadIdentity(clientCode: string, kind: ClientRuntimeSnapshotKind) {
    return `${clientCode}\0${kind}`;
  }
}
