import type { CustomError } from "@iam/api-core/errors/CustomError";
import { createLoginCredential } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.restore();

const KEY_PAIR = {
  privateKey: "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65",
  publicKey: "04112ddd8854e8262db2520bba112535844884c03348a45fcf4ee0f9a967979be52bd46caf43be697ae557ed2e4fa5b4dca8d2dbfa08c0f2f710c0f61591bb17dc",
};

const KID = "2026-05-primary";
const NOW = 1_780_000_000_000;

class FakeNonceStore {
  readonly keys = new Set<string>();
  readonly calls: unknown[][] = [];

  reset() {
    this.keys.clear();
    this.calls.length = 0;
  }

  async set(...args: [string, string, "EX", number, "NX"]) {
    this.calls.push(args);
    const [key] = args;
    if (this.keys.has(key)) {
      return null;
    }
    this.keys.add(key);
    return "OK";
  }
}

const fakeNonceStore = new FakeNonceStore();

mock.module("@api/env", () => ({
  default: {
    LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: {
      [KID]: KEY_PAIR.privateKey,
    },
    LOGIN_CREDENTIAL_MAX_SKEW_MS: 300_000,
    LOGIN_CREDENTIAL_NONCE_TTL_SECONDS: 360,
  },
}));

mock.module("@api/lib/infra/redis", () => ({
  default: fakeNonceStore,
}));

const { parseLoginPasswordCredential } = await import("../login-credential.helper");

function makeCredential(overrides: Partial<Parameters<typeof createLoginCredential>[0]> = {}) {
  return createLoginCredential({
    username: "138550",
    password: "1234",
    kid: KID,
    publicKey: KEY_PAIR.publicKey,
    now: NOW,
    nonce: "fixed-login-nonce-0001",
    encKey: "0123456789abcdeffedcba9876543210",
    macKey: "00112233445566778899aabbccddeeff",
    iv: "fedcba98765432100123456789abcdef",
    ...overrides,
  });
}

async function expectInvalidCredential(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    name: "InvalidLoginCredentialError",
    message: "登录凭证无效",
  } satisfies Partial<CustomError>);
}

beforeEach(() => {
  fakeNonceStore.reset();
});

describe("parseLoginPasswordCredential", () => {
  test("decrypts a valid credential and records nonce", async () => {
    await expect(parseLoginPasswordCredential(makeCredential(), { now: NOW })).resolves.toEqual({
      username: "138550",
      password: "1234",
    });

    expect(fakeNonceStore.calls).toHaveLength(1);
    expect(fakeNonceStore.calls[0]?.slice(1)).toEqual(["1", "EX", 360, "NX"]);
    expect(String(fakeNonceStore.calls[0]?.[0])).toStartWith("login-credential-nonce:");
  });

  test("rejects expired timestamps", async () => {
    await expectInvalidCredential(parseLoginPasswordCredential(
      makeCredential({ now: NOW - 300_001 }),
      { now: NOW },
    ));
  });

  test("rejects timestamps too far in the future", async () => {
    await expectInvalidCredential(parseLoginPasswordCredential(
      makeCredential({ now: NOW + 300_001 }),
      { now: NOW },
    ));
  });

  test("rejects nonce replay", async () => {
    await parseLoginPasswordCredential(makeCredential(), { now: NOW });

    await expectInvalidCredential(parseLoginPasswordCredential(makeCredential(), { now: NOW }));
  });

  test("rejects unknown key id", async () => {
    await expectInvalidCredential(parseLoginPasswordCredential(
      makeCredential({ kid: "unknown" }),
      { now: NOW },
    ));
  });

  test("rejects malformed credential text", async () => {
    await expectInvalidCredential(parseLoginPasswordCredential("not-a-credential", { now: NOW }));
  });
});
