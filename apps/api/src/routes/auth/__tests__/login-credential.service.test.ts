import { createMemoryRedis } from "@api/test/fakes";
import { createLoginCredential } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { createLoginCredentialParser } from "../login-credential.helper";

const KEY_PAIR = {
  privateKey: "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65",
  publicKey: "04112ddd8854e8262db2520bba112535844884c03348a45fcf4ee0f9a967979be52bd46caf43be697ae557ed2e4fa5b4dca8d2dbfa08c0f2f710c0f61591bb17dc",
};

const input = {
  username: "zhangsan",
  password: "pass1234",
  kid: "primary",
  publicKey: KEY_PAIR.publicKey,
  now: 1_780_000_000_000,
  nonce: "fixed-login-nonce-0001",
  encKey: "0123456789abcdeffedcba9876543210",
  macKey: "00112233445566778899aabbccddeeff",
  iv: "fedcba98765432100123456789abcdef",
};

function createParser() {
  return createLoginCredentialParser({
    clock: { now: () => input.now },
    nonceStore: createMemoryRedis() as any,
    config: {
      privateKeysByKid: { [input.kid]: KEY_PAIR.privateKey },
      maxSkewMs: 300_000,
      nonceTtlSeconds: 360,
    },
  });
}

describe("createLoginCredentialParser", () => {
  test("decrypts password login credentials and records nonce", async () => {
    const parser = createParser();
    const credential = createLoginCredential(input);

    await expect(parser.parseLoginPasswordCredential(credential)).resolves.toEqual({
      username: input.username,
      password: input.password,
    });
  });

  test("rejects nonce replay", async () => {
    const parser = createParser();
    const credential = createLoginCredential(input);

    await parser.parseLoginPasswordCredential(credential);
    await expect(parser.parseLoginPasswordCredential(credential)).rejects.toThrow("登录凭证无效");
  });
});
