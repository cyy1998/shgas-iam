import type {
  ClientRuntimeSnapshotAdapter,
  ClientRuntimeSnapshotReader,
} from "@iam/api-core/client-runtime-snapshot";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import {
  ClientRuntimeSnapshotUnavailableError,
} from "@iam/api-core/client-runtime-snapshot";
import {
  ClientCodeSchema,
  ClientStatus,
  RETRYABLE_SERVICE_UNAVAILABLE,
} from "@iam/contracts";
import { CustomSsoClientRuntimeDtoSchema } from "@iam/domain/client";

const POSITIVE_CACHE_TTL_MS = 30_000;
const NEGATIVE_CACHE_TTL_MS = 3_000;

export class CustomSsoClientRuntimeUnavailableError extends Error {
  public readonly retryability = RETRYABLE_SERVICE_UNAVAILABLE;

  constructor(options?: { cause?: unknown }) {
    super("Custom SSO client runtime is temporarily unavailable", options);
    this.name = "CustomSsoClientRuntimeUnavailableError";
  }
}

export interface CustomSsoClientRuntimeSource {
  findRuntimeRecord: (
    clientCode: string,
  ) => Promise<CustomSsoClientRuntimeDto | null>;
}

export function createCustomSsoClientRuntimeSnapshotAdapter(deps: {
  readonly repository: CustomSsoClientRuntimeSource;
}): ClientRuntimeSnapshotAdapter<"custom-sso", CustomSsoClientRuntimeDto> {
  return {
    kind: "custom-sso",
    presentTtlMs: POSITIVE_CACHE_TTL_MS,
    absentTtlMs: NEGATIVE_CACHE_TTL_MS,
    async load(clientCode) {
      const sourceClient = await deps.repository.findRuntimeRecord(clientCode);
      if (sourceClient === null)
        return { kind: "absent" };
      const client = CustomSsoClientRuntimeDtoSchema.parse(sourceClient);
      if (client.clientCode !== clientCode) {
        throw new TypeError(
          "Custom SSO client runtime source returned a different client",
        );
      }
      if (!isCustomSsoClientAvailable(client))
        return { kind: "absent" };
      return { kind: "present", value: client };
    },
    codec: {
      encode(value) {
        return CustomSsoClientRuntimeDtoSchema.parse(value);
      },
      decode(payload) {
        return CustomSsoClientRuntimeDtoSchema.parse(payload);
      },
    },
  };
}

function isCustomSsoClientAvailable(
  client: CustomSsoClientRuntimeDto,
) {
  return !client.isDelete
    && (client.status === ClientStatus.Enable
      || client.status === ClientStatus.Maintenance)
    && client.customSsoEnabled
    && client.customSsoConfig !== null;
}

export function createCustomSsoClientRuntimeReader(
  reader: ClientRuntimeSnapshotReader<CustomSsoClientRuntimeDto>,
) {
  return {
    async findRuntimeRecord(clientCode: string) {
      if (!ClientCodeSchema.safeParse(clientCode).success)
        return null;
      try {
        const snapshot = await reader.acquire(clientCode);
        return snapshot.kind === "present" ? snapshot.value : null;
      }
      catch (error) {
        if (error instanceof ClientRuntimeSnapshotUnavailableError)
          throw new CustomSsoClientRuntimeUnavailableError();
        throw error;
      }
    },
  };
}

export type CustomSsoClientRuntimeReader = ReturnType<
  typeof createCustomSsoClientRuntimeReader
>;
