import { createHash } from "node:crypto";
import config from "@api/env";
import redis from "@api/lib/infra/redis";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidLoginCredentialError } from "@iam/api-core/errors/InvalidLoginCredentialError";
import {
  decryptLoginCredential,
  LOGIN_CREDENTIAL_TYPE,
  LOGIN_CREDENTIAL_VERSION,
  LoginCredentialError,
} from "@iam/contracts";
import { z } from "zod";

export type LoginPasswordCredential = {
  username: string;
  password: string;
};

type RedisNonceStore = {
  set: (...args: [string, string, "EX", number, "NX"]) => Promise<unknown>;
};

type ParseCredentialOptions = {
  now?: number;
  privateKeys?: Record<string, string>;
  maxSkewMs?: number;
  nonceTtlSeconds?: number;
  nonceStore?: RedisNonceStore;
};

const INVALID_CREDENTIAL_MESSAGE = "登录凭证无效";

const LoginCredentialPayloadSchema = z.object({
  v: z.literal(LOGIN_CREDENTIAL_VERSION),
  typ: z.literal(LOGIN_CREDENTIAL_TYPE),
  username: z.string().min(1),
  password: z.string().min(1),
  ts: z.number().int().safe(),
  nonce: z.string().min(16),
});

function invalidCredential(): never {
  throw new InvalidLoginCredentialError(INVALID_CREDENTIAL_MESSAGE);
}

function nonceKey(kid: string, nonce: string) {
  const digest = createHash("sha256")
    .update(`${kid}:${nonce}`)
    .digest("hex");

  return `login-credential-nonce:${digest}`;
}

function assertTimestampInWindow(ts: number, now: number, maxSkewMs: number) {
  if (Math.abs(now - ts) > maxSkewMs) {
    invalidCredential();
  }
}

async function recordNonce(
  kid: string,
  nonce: string,
  nonceStore: RedisNonceStore,
  nonceTtlSeconds: number,
) {
  const result = await nonceStore.set(nonceKey(kid, nonce), "1", "EX", nonceTtlSeconds, "NX");
  if (result !== "OK") {
    invalidCredential();
  }
}

export async function parseLoginPasswordCredential(
  credential: string,
  options: ParseCredentialOptions = {},
): Promise<LoginPasswordCredential> {
  try {
    const parsed = decryptLoginCredential(
      credential,
      options.privateKeys ?? config.LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON,
    );
    const now = options.now ?? Date.now();
    const maxSkewMs = options.maxSkewMs ?? config.LOGIN_CREDENTIAL_MAX_SKEW_MS;
    const nonceTtlSeconds = options.nonceTtlSeconds ?? config.LOGIN_CREDENTIAL_NONCE_TTL_SECONDS;
    const nonceStore = options.nonceStore ?? redis;
    const payload = LoginCredentialPayloadSchema.parse(parsed.payload);

    assertTimestampInWindow(payload.ts, now, maxSkewMs);
    await recordNonce(parsed.kid, payload.nonce, nonceStore, nonceTtlSeconds);

    return {
      username: payload.username,
      password: payload.password,
    };
  }
  catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    if (error instanceof LoginCredentialError) {
      invalidCredential();
    }
    invalidCredential();
  }
}
