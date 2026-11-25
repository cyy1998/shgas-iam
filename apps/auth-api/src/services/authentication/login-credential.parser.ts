import { createHash } from "node:crypto";
import type { ClockPort } from "@auth-api/composition/runtime";
import {
  decryptLoginCredential,
  LOGIN_CREDENTIAL_TYPE,
  type LoginCredentialPlaintext,
  WECHAT_BINDING_CREDENTIAL_TYPE,
} from "@iam/contracts";
import { CustomError } from "@iam/runtime/errors";
import { InvalidLoginCredentialError } from "./login-credential.error";

export type LoginPasswordCredential = {
  username: string;
  password: string;
};

type RedisNonceStore = {
  set: (...args: [string, string, "EX", number, "NX"]) => Promise<unknown>;
};

export interface LoginCredentialParserDeps {
  clock: Pick<ClockPort, "now">;
  nonceStore: RedisNonceStore;
  config: {
    privateKeysByKid: Record<string, string>;
    maxSkewMs: number;
    nonceTtlSeconds: number;
  };
}

type ParseCredentialOptions = {
  now?: number;
  privateKeys?: Record<string, string>;
  maxSkewMs?: number;
  nonceTtlSeconds?: number;
  nonceStore?: RedisNonceStore;
};

const INVALID_CREDENTIAL_MESSAGE = "登录凭证无效";
const INVALID_CREDENTIAL_TIMESTAMP_MESSAGE = "登录凭证已过期或设备时间不正确，请校正设备时间后重试";

function invalidCredential(): never {
  throw new InvalidLoginCredentialError(INVALID_CREDENTIAL_MESSAGE);
}

function invalidCredentialTimestamp(): never {
  throw new InvalidLoginCredentialError(INVALID_CREDENTIAL_TIMESTAMP_MESSAGE);
}

function nonceKey(kid: string, nonce: string) {
  const digest = createHash("sha256").update(`${kid}:${nonce}`).digest("hex");

  return `login-credential-nonce:${digest}`;
}

function assertTimestampInWindow(ts: number, now: number, maxSkewMs: number) {
  if (Math.abs(now - ts) > maxSkewMs) {
    invalidCredentialTimestamp();
  }
}

async function recordNonce(kid: string, nonce: string, nonceStore: RedisNonceStore, nonceTtlSeconds: number) {
  const result = await nonceStore.set(nonceKey(kid, nonce), "1", "EX", nonceTtlSeconds, "NX");
  if (result !== "OK") {
    invalidCredential();
  }
}

export function createLoginCredentialParser(deps: LoginCredentialParserDeps) {
  async function parsePassword(
    credential: string,
    options: ParseCredentialOptions,
    accepts: (payload: LoginCredentialPlaintext, now: number) => boolean,
    bindingDeadline?: number,
  ): Promise<LoginPasswordCredential> {
    try {
      const parsed = decryptLoginCredential(credential, options.privateKeys ?? deps.config.privateKeysByKid);
      const now = options.now ?? deps.clock.now();
      const maxSkewMs = options.maxSkewMs ?? deps.config.maxSkewMs;
      const nonceTtlSeconds = options.nonceTtlSeconds ?? deps.config.nonceTtlSeconds;
      const nonceStore = options.nonceStore ?? deps.nonceStore;
      const { payload } = parsed;

      if (!accepts(payload, now)) invalidCredential();
      assertTimestampInWindow(payload.ts, now, maxSkewMs);
      const ttl =
        bindingDeadline === undefined
          ? nonceTtlSeconds
          : Math.max(nonceTtlSeconds, Math.ceil((bindingDeadline - now) / 1000));
      await recordNonce(parsed.kid, payload.nonce, nonceStore, ttl);

      return {
        username: payload.username,
        password: payload.password,
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      invalidCredential();
    }
  }

  return {
    parseLoginPasswordCredential(credential: string, options: ParseCredentialOptions = {}) {
      return parsePassword(credential, options, (payload) => payload.typ === LOGIN_CREDENTIAL_TYPE);
    },
    parseWechatBindingPasswordCredential(credential: string, request: { requestId: string; expiresAt: number }) {
      return parsePassword(
        credential,
        {},
        (payload, now) =>
          payload.typ === WECHAT_BINDING_CREDENTIAL_TYPE &&
          payload.requestId === request.requestId &&
          now < request.expiresAt,
        request.expiresAt,
      );
    },
  };
}

export type LoginCredentialParser = ReturnType<typeof createLoginCredentialParser>;
