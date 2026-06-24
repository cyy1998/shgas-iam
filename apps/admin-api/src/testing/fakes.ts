import type { AfterCommitLoggerPort } from "@iam/api-core/uow";
import { createImmediateUnitOfWork as createImmediateUnitOfWorkBase } from "@iam/api-core/uow";
import { mock } from "bun:test";

export function createImmediateUnitOfWork<TxPorts extends object>(
  txPorts: TxPorts,
  options: { logger?: AfterCommitLoggerPort } = {},
) {
  return createImmediateUnitOfWorkBase(txPorts, options);
}

export function createFakePasswordHasher() {
  return {
    hashPassword: mock(async (password: string) => `hashed:${password}`),
    hashSecret: mock(async (secret: string) => `hashed-secret:${secret}`),
  };
}

export function createFakeRandom() {
  return {
    uuid: mock(() => "00000000-0000-4000-8000-000000000001"),
    oidcClientSecret: mock(() => "iam_oidc_test_secret"),
    password: mock(() => "Rand1234"),
    integer: mock((min: number) => min),
    bytes: mock((size: number) => new Uint8Array(size)),
  };
}

export function createFakeClock(now = new Date("2026-01-01T00:00:00Z").getTime()) {
  return {
    now: mock(() => now),
    nowDate: mock(() => new Date(now)),
  };
}
