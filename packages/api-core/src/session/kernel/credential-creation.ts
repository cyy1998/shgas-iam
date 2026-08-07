import type { SessionKernelKeyBuilder } from "./keys";
import type { IssuedCredential } from "./model";
import type {
  SessionKernelRedis,
  StoreIndexWrite,
} from "./store";
import { stringifyLifecycleObject } from "./model";
import { SESSION_KERNEL_CREATE_CREDENTIAL_SCRIPT } from "./scripts";

export type CredentialCreateResult
  = | "created"
    | "active_identity_conflict"
    | "identity_tombstoned"
    | "lookup_owned"
    | "lookup_tombstoned";

export interface SessionKernelCredentialCreator {
  create: (input: {
    credential: IssuedCredential;
    indexes: StoreIndexWrite[];
  }) => Promise<CredentialCreateResult>;
}

export function createRedisSessionKernelCredentialCreator(
  redis: SessionKernelRedis,
  keys: SessionKernelKeyBuilder,
): SessionKernelCredentialCreator {
  return {
    async create(input) {
      if (!redis.eval)
        throw new Error("session kernel Redis eval is required to create a credential");

      const { credential, indexes } = input;
      const result = await redis.eval(
        SESSION_KERNEL_CREATE_CREDENTIAL_SCRIPT,
        4 + indexes.length,
        keys.active("credential", credential.credentialId),
        keys.tombstone("credential", credential.credentialId),
        keys.lookup("credential", credential.lookupHash),
        keys.lookupTombstone("credential", credential.lookupHash),
        ...indexes.map(index => index.key),
        stringifyLifecycleObject(credential),
        credential.credentialId,
        credential.expiresAt,
        ...indexes.flatMap(index => [index.score, index.member]),
      );
      if (isCredentialCreateResult(result))
        return result;
      throw new Error("session kernel Redis returned an invalid credential create result");
    },
  };
}

function isCredentialCreateResult(value: unknown): value is CredentialCreateResult {
  return value === "created"
    || value === "active_identity_conflict"
    || value === "identity_tombstoned"
    || value === "lookup_owned"
    || value === "lookup_tombstoned";
}
