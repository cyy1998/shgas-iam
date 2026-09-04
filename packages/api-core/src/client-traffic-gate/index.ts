import type { ClientStatus } from "@iam/contracts";
import type {
  ClientRuntimeSnapshotAdapter,
  ClientRuntimeSnapshotReader,
} from "../client-runtime-snapshot";
import { ClientCodeSchema, ClientStatus as ClientStatusValue } from "@iam/contracts";
import { z } from "zod";
import {
  ClientRuntimeSnapshotUnavailableError,
} from "../client-runtime-snapshot";

const POSITIVE_CACHE_TTL_MS = 30_000;
const NEGATIVE_CACHE_TTL_MS = 3_000;

const ClientTrafficGateSnapshotSchema = z.object({
  outcome: z.enum(["enabled", "maintenance", "disabled", "deleted"]),
}).strict();

export type ClientTrafficGateSnapshot = z.infer<
  typeof ClientTrafficGateSnapshotSchema
>;

export type ClientTrafficGateResult
  = | ClientTrafficGateSnapshot
    | {
      readonly outcome: "unavailable";
      readonly reason: "missing" | "read-failed";
    };

export interface ClientTrafficGateSourceRecord {
  readonly clientCode: string;
  readonly isDelete: boolean;
  readonly status: ClientStatus;
}

export interface ClientTrafficGateSource {
  findClientTrafficState: (
    clientCode: string,
  ) => Promise<ClientTrafficGateSourceRecord | null>;
}

export function createClientTrafficGateSnapshotAdapter(deps: {
  readonly source: ClientTrafficGateSource;
}): ClientRuntimeSnapshotAdapter<"traffic-gate", ClientTrafficGateSnapshot> {
  return {
    kind: "traffic-gate",
    presentTtlMs: POSITIVE_CACHE_TTL_MS,
    absentTtlMs: NEGATIVE_CACHE_TTL_MS,
    async load(clientCode) {
      const record = await deps.source.findClientTrafficState(clientCode);
      if (record === null)
        return { kind: "absent" };
      if (record.clientCode !== clientCode)
        throw new TypeError("Client Traffic Gate source returned a different client");
      return {
        kind: "present",
        value: sourceRecordToSnapshot(record),
      };
    },
    codec: {
      encode(value) {
        return ClientTrafficGateSnapshotSchema.parse(value);
      },
      decode(payload) {
        return ClientTrafficGateSnapshotSchema.parse(payload);
      },
    },
  };
}

export function createClientTrafficGateReader(
  reader: ClientRuntimeSnapshotReader<ClientTrafficGateSnapshot>,
) {
  return {
    async check(clientCode: string): Promise<ClientTrafficGateResult> {
      if (!ClientCodeSchema.safeParse(clientCode).success)
        return unavailable("missing");
      try {
        const snapshot = await reader.acquire(clientCode);
        return snapshot.kind === "present"
          ? snapshot.value
          : unavailable("missing");
      }
      catch (error) {
        if (error instanceof ClientRuntimeSnapshotUnavailableError)
          return unavailable("read-failed");
        throw error;
      }
    },
  };
}

function sourceRecordToSnapshot(
  record: ClientTrafficGateSourceRecord,
): ClientTrafficGateSnapshot {
  if (record.isDelete)
    return { outcome: "deleted" };
  if (record.status === ClientStatusValue.Enable)
    return { outcome: "enabled" };
  if (record.status === ClientStatusValue.Maintenance)
    return { outcome: "maintenance" };
  if (record.status === ClientStatusValue.Disable)
    return { outcome: "disabled" };
  throw new TypeError("Invalid Client Traffic Gate status");
}

function unavailable(
  reason: Extract<ClientTrafficGateResult, { outcome: "unavailable" }>["reason"],
): Extract<ClientTrafficGateResult, { outcome: "unavailable" }> {
  return { outcome: "unavailable", reason };
}
