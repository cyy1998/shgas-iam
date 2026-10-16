import type { ClientStatus } from "@iam/contracts";

export interface GatewayCredentialReader {
  readByClientCode(clientCode: string): Promise<{
    clientSecret: string;
    status: ClientStatus;
    isDelete: boolean;
  } | null>;
}

import type { ManifestObject, ResourceKind } from "../../types";

export interface GatewayRemoteReader {
  read(signal?: AbortSignal): Promise<Record<ResourceKind, ManifestObject[]>>;
}

export interface GatewayRemoteWriter {
  assertRestorableDeletions(
    targets: ReadonlyArray<{ kind: ResourceKind; id: string }>,
    signal?: AbortSignal,
  ): Promise<void>;
  upsert(kind: ResourceKind, id: string, value: ManifestObject, signal?: AbortSignal): Promise<void>;
  delete(kind: ResourceKind, id: string, signal?: AbortSignal): Promise<void>;
}
