import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import {
  createLoginCredential,
  decryptLoginCredential,
  LOGIN_CREDENTIAL_ALG,
  LOGIN_CREDENTIAL_PREFIX,
  LoginCredentialError,
} from "../login-credential";

const KEY_PAIR = {
  privateKey: "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65",
  publicKey: "04112ddd8854e8262db2520bba112535844884c03348a45fcf4ee0f9a967979be52bd46caf43be697ae557ed2e4fa5b4dca8d2dbfa08c0f2f710c0f61591bb17dc",
};

const FIXED_INPUT = {
  username: "138550",
  password: "1234",
  kid: "2026-05-primary",
  publicKey: KEY_PAIR.publicKey,
  now: 1_780_000_000_000,
  nonce: "fixed-login-nonce-0001",
  encKey: "0123456789abcdeffedcba9876543210",
  macKey: "00112233445566778899aabbccddeeff",
  iv: "fedcba98765432100123456789abcdef",
};

describe("login credential protocol", () => {
  test("does not expose login plaintext in the wire envelope", () => {
    const input = {
      ...FIXED_INPUT,
      username: "plaintext-username-sentinel",
      password: "plaintext-password-sentinel",
    };
    const credential = createLoginCredential(input);
    const encodedEnvelope = credential.split(".")[1]!;
    const envelope = Buffer.from(encodedEnvelope, "base64url").toString("utf8");
    for (const plaintext of [input.username, input.password]) {
      expect(credential).not.toContain(plaintext);
      expect(envelope).not.toContain(plaintext);
    }
    expect(decryptLoginCredential(credential, {
      [input.kid]: KEY_PAIR.privateKey,
    }).payload).toMatchObject({ username: input.username, password: input.password });
  });

  test("creates a SM login credential that decrypts to password login payload", () => {
    const credential = createLoginCredential(FIXED_INPUT);

    expect(credential.startsWith(`${LOGIN_CREDENTIAL_PREFIX}.`)).toBe(true);

    const parsed = decryptLoginCredential(credential, {
      [FIXED_INPUT.kid]: KEY_PAIR.privateKey,
    });

    expect(parsed).toEqual({
      kid: FIXED_INPUT.kid,
      alg: LOGIN_CREDENTIAL_ALG,
      payload: {
        v: 1,
        typ: "password-login",
        username: FIXED_INPUT.username,
        password: FIXED_INPUT.password,
        ts: FIXED_INPUT.now,
        nonce: FIXED_INPUT.nonce,
      },
    });
  });

  test("rejects unknown key id", () => {
    const credential = createLoginCredential(FIXED_INPUT);

    expect(() => decryptLoginCredential(credential, {})).toThrow(LoginCredentialError);
  });

  test("rejects tampered envelope tags before returning plaintext", () => {
    const credential = createLoginCredential(FIXED_INPUT);
    const [prefix, encodedEnvelope] = credential.split(".");
    const envelope = JSON.parse(Buffer.from(encodedEnvelope, "base64url").toString("utf8")) as { tag: string };
    envelope.tag = envelope.tag.replace(/.$/u, char => (char === "A" ? "B" : "A"));
    const tampered = `${prefix}.${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url")}`;

    expect(() => decryptLoginCredential(tampered, {
      [FIXED_INPUT.kid]: KEY_PAIR.privateKey,
    })).toThrow(LoginCredentialError);
  });

  test("rejects malformed credential text", () => {
    expect(() => decryptLoginCredential("not-a-credential", {
      [FIXED_INPUT.kid]: KEY_PAIR.privateKey,
    })).toThrow(LoginCredentialError);
  });
});
