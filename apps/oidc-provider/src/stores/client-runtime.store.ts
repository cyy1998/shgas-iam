import type {
  ClientRuntimeSnapshotAdapter,
  ClientRuntimeSnapshotReader,
} from "@iam/api-core/client-runtime-snapshot";
import type { OidcClientRuntimeDto } from "@iam/domain/client";
import type { OidcClientRuntimeMetadata } from "../provider/client/client-runtime-metadata.ts";
import {
  ClientRuntimeSnapshotUnavailableError,
} from "@iam/api-core/client-runtime-snapshot";
import { errors } from "oidc-provider";
import {
  OidcClientRuntimeMetadataSchema,
  toOidcClientRuntimeMetadata,
} from "../provider/client/client-runtime-metadata.ts";
import { isOidcClientAvailable } from "../repositories/availability.ts";

export interface OidcClientRuntimeRecordReader {
  findRuntimeRecord: (clientCode: string) => Promise<OidcClientRuntimeDto | null>;
}

export interface CreateOidcClientRuntimeSnapshotAdapterDeps {
  readonly repository: OidcClientRuntimeRecordReader;
  readonly cacheTtlSeconds: number;
}

export function createOidcClientRuntimeSnapshotAdapter(
  deps: CreateOidcClientRuntimeSnapshotAdapterDeps,
): ClientRuntimeSnapshotAdapter<"oidc", OidcClientRuntimeMetadata> {
  const presentTtlMs = deps.cacheTtlSeconds * 1_000;
  if (!Number.isSafeInteger(presentTtlMs) || presentTtlMs <= 0)
    throw new RangeError("OIDC Client Runtime Snapshot TTL must be a positive safe integer");
  return {
    kind: "oidc",
    presentTtlMs,
    async load(clientCode) {
      const client = await deps.repository.findRuntimeRecord(clientCode);
      if (!client || !isOidcClientAvailable(client))
        return { kind: "absent" };
      return {
        kind: "present",
        value: toOidcClientRuntimeMetadata(client),
      };
    },
    codec: {
      encode(value) {
        return OidcClientRuntimeMetadataSchema.parse(value);
      },
      decode(payload) {
        return OidcClientRuntimeMetadataSchema.parse(payload);
      },
    },
  };
}

export function createOidcClientRuntimeStore(
  reader: ClientRuntimeSnapshotReader<OidcClientRuntimeMetadata>,
) {
  async function findRuntime(clientCode: string): Promise<OidcClientRuntimeMetadata | null> {
    try {
      const snapshot = await reader.acquire(clientCode);
      return snapshot.kind === "present" ? snapshot.value : null;
    }
    catch (error) {
      if (error instanceof ClientRuntimeSnapshotUnavailableError)
        throw new errors.TemporarilyUnavailable("Client Runtime Snapshot unavailable");
      throw error;
    }
  }

  return {
    findRuntime,
    async findActiveVersion(clientCode: string) {
      return (await findRuntime(clientCode))?.oidc_config_version ?? null;
    },
  };
}

export type OidcClientRuntimeStore = ReturnType<typeof createOidcClientRuntimeStore>;
