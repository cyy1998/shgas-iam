import { createMemoryRedis } from "@api/testing/fakes";
import { InvalidLoginCredentialError } from "@iam/api-core/errors/InvalidLoginCredentialError";
import { createLoginCredential } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { createLoginCredentialParser } from "../login-credential.parser";

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

function createParser(redis = createMemoryRedis(() => input.now)) {
  return createLoginCredentialParser({
    clock: { now: () => input.now },
    nonceStore: redis as any,
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

  test("records the existing hashed nonce key with the configured TTL", async () => {
    const redis = createMemoryRedis(() => input.now);
    const parser = createParser(redis);

    await parser.parseLoginPasswordCredential(createLoginCredential(input));

    const nonceKey = "login-credential-nonce:df0898ddda75af8443f5020488d02cb082de74a1d9dff0bb8547fc1e96d7a14f";
    expect(await redis.get(nonceKey)).toBe("1");
    expect(await redis.ttl(nonceKey)).toBe(360);
  });

  test("rejects nonce replay", async () => {
    const parser = createParser();
    const credential = createLoginCredential(input);

    await parser.parseLoginPasswordCredential(credential);
    await expect(parser.parseLoginPasswordCredential(credential)).rejects.toThrow("登录凭证无效");
  });

  test("rejects credentials outside the timestamp window with a clear message", async () => {
    const parser = createParser();
    const credential = createLoginCredential({
      ...input,
      now: input.now - 300_001,
    });

    await expect(parser.parseLoginPasswordCredential(credential)).rejects.toThrow(
      "登录凭证已过期或设备时间不正确，请校正设备时间后重试",
    );
  });

  test("maps malformed encrypted input to the public login credential error", async () => {
    const parser = createParser();

    await expect(parser.parseLoginPasswordCredential("not-an-iam-credential"))
      .rejects
      .toBeInstanceOf(InvalidLoginCredentialError);
  });
});
