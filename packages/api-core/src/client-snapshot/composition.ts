import type { z } from "zod";
import type { ClientSnapshotAtomicStore } from "./atomic-store";
import type { ClientSnapshot, ClientSnapshotRedis, ClientSnapshotSource } from "./contract";
import type { ClientCredentialSource } from "./credentials";
import { randomUUID } from "node:crypto";
import { ClientCodeSchema } from "@iam/contracts";
import { z as schemaBuilder } from "zod";
import {
  ClientSnapshotInvalidationError,
  ClientSnapshotUnavailableError,
  ClientSnapshotValueSchema,
} from "./contract";
import { ClientCredentialValueSchema } from "./credentials";

import { createClientSnapshotRedisStore } from "./redis-store";

export interface ClientSnapshotsOptions {
  readonly redis: ClientSnapshotRedis;
  readonly source: ClientSnapshotSource & ClientCredentialSource;
  readonly presentTtlMs?: number;
  readonly absentTtlMs?: number;
}

export function createClientSnapshots(options: ClientSnapshotsOptions) {
  return createClientSnapshotsWithStore(options, createClientSnapshotRedisStore(options.redis));
}

function createClientSnapshotsWithStore(options: ClientSnapshotsOptions, store: ClientSnapshotAtomicStore) {
  const presentTtlMs = options.presentTtlMs ?? 30_000;
  const absentTtlMs = options.absentTtlMs ?? 3_000;
  for (const ttl of [presentTtlMs, absentTtlMs]) {
    if (!Number.isSafeInteger(ttl) || ttl <= 0)
      throw new RangeError("Snapshot TTL must be a positive safe integer");
  }
  function reader<T>(
    kind: "client" | "credential",
    schema: z.ZodType<T>,
    load: (code: string) => Promise<unknown>,
    matches: (value: T, code: string) => boolean = () => true,
  ) {
    const inFlight = new Map<string, Promise<{ snapshot: ClientSnapshot<T>; published: boolean }>>();
    const envelopeSchema = zEnvelope(schema);
    async function acquire(code: string): Promise<ClientSnapshot<T>> {
      ClientCodeSchema.parse(code);
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          // Each caller observes Redis before joining a source load. A warm response
          // delayed across another process's invalidation cannot admit a new caller.
          const state = await store.readOrBootstrap(code, kind, randomUUID());
          const cached = decode(state.payload, envelopeSchema);
          if (
            cached
            && cached.clientCode === code
            && cached.reader === kind
            && cached.epoch === state.control.epoch
            && cached.generation === state.control.generation
            && (cached.snapshot.kind === "absent" || matches(cached.snapshot.value, code))
          ) {
            return cached.snapshot;
          }
          const key = JSON.stringify([code, state.control.epoch, state.control.generation]);
          let operation = inFlight.get(key);
          if (!operation) {
            operation = (async () => {
              const row = await load(code);
              const snapshot: ClientSnapshot<T>
                = row === null ? { kind: "absent" } : { kind: "present", value: schema.parse(row) };
              if (snapshot.kind === "present" && !matches(snapshot.value, code))
                throw new ClientSnapshotUnavailableError();
              const payload = JSON.stringify({
                version: 1,
                clientCode: code,
                reader: kind,
                ...state.control,
                snapshot,
              });
              const result = await store.publishIfCurrent(
                code,
                kind,
                state.control,
                payload,
                snapshot.kind === "present" ? presentTtlMs : absentTtlMs,
              );
              return { snapshot, published: result === "published" };
            })();
            inFlight.set(key, operation);
          }
          try {
            const result = await operation;
            if (result.published)
              return result.snapshot;
          }
          finally {
            if (inFlight.get(key) === operation)
              inFlight.delete(key);
          }
        }
      }
      catch {
        throw new ClientSnapshotUnavailableError();
      }
      throw new ClientSnapshotUnavailableError();
    }
    return { acquire };
  }
  const client = reader(
    "client",
    ClientSnapshotValueSchema,
    code => options.source.loadClient(code),
    (value, code) => value.clientCode === code,
  );
  const credential = reader("credential", ClientCredentialValueSchema, code =>
    options.source.loadCredential(code));
  return {
    client,
    credential,
    gate: {
      async acquire(code: string) {
        const observed = await client.acquire(code);
        return observed.kind === "absent"
          ? observed
          : {
              kind: "present" as const,
              value: {
                clientCode: observed.value.clientCode,
                status: observed.value.status,
              },
            };
      },
    },
    async invalidateClient(code: string) {
      ClientCodeSchema.parse(code);
      try {
        await store.invalidateClient(code, randomUUID());
      }
      catch {
        throw new ClientSnapshotInvalidationError();
      }
    },
  };
}

function zEnvelope<T>(schema: z.ZodType<T>) {
  return schemaBuilder.object({
    version: schemaBuilder.literal(1),
    clientCode: ClientCodeSchema,
    reader: schemaBuilder.enum(["client", "credential"]),
    epoch: schemaBuilder.string().min(1),
    generation: schemaBuilder.string().regex(/^\d+$/u),
    snapshot: schemaBuilder.discriminatedUnion("kind", [
      schemaBuilder.object({ kind: schemaBuilder.literal("absent") }),
      schemaBuilder.object({
        kind: schemaBuilder.literal("present"),
        value: schema,
      }),
    ]),
  });
}
function decode<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (raw === null)
    return null;
  try {
    return schema.parse(JSON.parse(raw));
  }
  catch {
    return null;
  }
}
