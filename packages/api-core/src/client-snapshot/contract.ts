import {
  ClientCodeSchema,
  ClientSsoConfigSchema,
  ClientStatus,
} from "@iam/contracts";
import { z } from "zod";

export const ClientSnapshotValueSchema = z
  .object({
    clientCode: ClientCodeSchema,
    status: z.enum(ClientStatus),
    ssoEnabled: z.boolean(),
    ssoConfig: ClientSsoConfigSchema.nullable(),
  })
  .refine(value => !value.ssoEnabled || value.ssoConfig !== null);

export type ClientSnapshotValue = z.infer<typeof ClientSnapshotValueSchema>;
export type ClientSnapshot<T = ClientSnapshotValue>
  = { readonly kind: "absent" } | { readonly kind: "present"; readonly value: T };
export interface ClientSnapshotReader<T = ClientSnapshotValue> {
  readonly acquire: (clientCode: string) => Promise<ClientSnapshot<T>>;
}
export interface ClientSnapshotSource {
  readonly loadClient: (clientCode: string) => Promise<unknown | null>;
}
export interface ClientSnapshotRedis {
  readonly eval: (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => Promise<unknown>;
}
export class ClientSnapshotUnavailableError extends Error {
  constructor() {
    super("Client Snapshot unavailable");
    this.name = "ClientSnapshotUnavailableError";
  }
}
export class ClientSnapshotInvalidationError extends Error {
  constructor() {
    super("Client Snapshot invalidation failed");
    this.name = "ClientSnapshotInvalidationError";
  }
}
