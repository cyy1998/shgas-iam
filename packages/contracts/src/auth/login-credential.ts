import smCrypto from "sm-crypto";

const { sm2, sm3, sm4 } = smCrypto;

export const LOGIN_CREDENTIAL_PREFIX = "iam-login-v1";
export const LOGIN_CREDENTIAL_VERSION = 1;
export const LOGIN_CREDENTIAL_TYPE = "password-login";
export const LOGIN_CREDENTIAL_ALG = "SM2-SM4-CBC";
export const LOGIN_CREDENTIAL_SM2_CIPHER_MODE = 1;

export interface LoginCredentialPlaintext {
  v: typeof LOGIN_CREDENTIAL_VERSION;
  typ: typeof LOGIN_CREDENTIAL_TYPE;
  username: string;
  password: string;
  ts: number;
  nonce: string;
}

export interface LoginCredentialEnvelope {
  v: typeof LOGIN_CREDENTIAL_VERSION;
  alg: typeof LOGIN_CREDENTIAL_ALG;
  kid: string;
  ek: string;
  iv: string;
  ct: string;
  tag: string;
}

export interface LoginCredentialKeyMaterial {
  encKey: string;
  macKey: string;
}

export interface CreateLoginCredentialInput {
  username: string;
  password: string;
  kid: string;
  publicKey: string;
  now?: number;
  nonce?: string;
  encKey?: string;
  macKey?: string;
  iv?: string;
}

export interface ParsedLoginCredential {
  kid: string;
  alg: typeof LOGIN_CREDENTIAL_ALG;
  payload: LoginCredentialPlaintext;
}

export class LoginCredentialError extends Error {
  constructor(message = "登录凭证无效") {
    super(message);
    this.name = "LoginCredentialError";
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));

  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");

  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/iu.test(hex)) {
    throw new LoginCredentialError();
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(utf8ToBytes(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(bytesToUtf8(base64UrlToBytes(value))) as T;
}

function hexToBase64Url(hex: string): string {
  return bytesToBase64Url(hexToBytes(hex));
}

function base64UrlToHex(value: string): string {
  return bytesToHex(base64UrlToBytes(value));
}

function envelopeSigningInput(envelope: Omit<LoginCredentialEnvelope, "tag">): string {
  return [
    String(envelope.v),
    envelope.alg,
    envelope.kid,
    envelope.ek,
    envelope.iv,
    envelope.ct,
  ].join(".");
}

function calculateTag(envelope: Omit<LoginCredentialEnvelope, "tag">, macKey: string): string {
  return hexToBase64Url(sm3(envelopeSigningInput(envelope), { key: macKey, mode: "hmac" }));
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = utf8ToBytes(left);
  const rightBytes = utf8ToBytes(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

function assertHex(value: string, byteLength: number): string {
  if (!new RegExp(`^[0-9a-f]{${byteLength * 2}}$`, "iu").test(value)) {
    throw new LoginCredentialError();
  }
  return value.toLowerCase();
}

function assertPlaintext(value: unknown): LoginCredentialPlaintext {
  if (typeof value !== "object" || value === null) {
    throw new LoginCredentialError();
  }

  const payload = value as Record<string, unknown>;
  if (
    payload.v !== LOGIN_CREDENTIAL_VERSION
    || payload.typ !== LOGIN_CREDENTIAL_TYPE
    || typeof payload.username !== "string"
    || payload.username.trim() === ""
    || typeof payload.password !== "string"
    || payload.password === ""
    || typeof payload.ts !== "number"
    || !Number.isSafeInteger(payload.ts)
    || typeof payload.nonce !== "string"
    || payload.nonce.length < 16
  ) {
    throw new LoginCredentialError();
  }

  return {
    v: LOGIN_CREDENTIAL_VERSION,
    typ: LOGIN_CREDENTIAL_TYPE,
    username: payload.username,
    password: payload.password,
    ts: payload.ts,
    nonce: payload.nonce,
  };
}

function assertEnvelope(value: unknown): LoginCredentialEnvelope {
  if (typeof value !== "object" || value === null) {
    throw new LoginCredentialError();
  }

  const envelope = value as Record<string, unknown>;
  if (
    envelope.v !== LOGIN_CREDENTIAL_VERSION
    || envelope.alg !== LOGIN_CREDENTIAL_ALG
    || typeof envelope.kid !== "string"
    || envelope.kid.trim() === ""
    || typeof envelope.ek !== "string"
    || typeof envelope.iv !== "string"
    || typeof envelope.ct !== "string"
    || typeof envelope.tag !== "string"
  ) {
    throw new LoginCredentialError();
  }

  return {
    v: LOGIN_CREDENTIAL_VERSION,
    alg: LOGIN_CREDENTIAL_ALG,
    kid: envelope.kid,
    ek: envelope.ek,
    iv: envelope.iv,
    ct: envelope.ct,
    tag: envelope.tag,
  };
}

function parseCredentialEnvelope(credential: string): LoginCredentialEnvelope {
  const prefix = `${LOGIN_CREDENTIAL_PREFIX}.`;
  if (!credential.startsWith(prefix)) {
    throw new LoginCredentialError();
  }

  return assertEnvelope(decodeJson(credential.slice(prefix.length)));
}

function parseKeyMaterial(value: string): LoginCredentialKeyMaterial {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (typeof parsed.encKey !== "string" || typeof parsed.macKey !== "string") {
    throw new LoginCredentialError();
  }

  return {
    encKey: assertHex(parsed.encKey, 16),
    macKey: assertHex(parsed.macKey, 16),
  };
}

export function createLoginCredential(input: CreateLoginCredentialInput): string {
  const encKey = assertHex(input.encKey ?? randomHex(16), 16);
  const macKey = assertHex(input.macKey ?? randomHex(16), 16);
  const ivHex = assertHex(input.iv ?? randomHex(16), 16);
  const nonce = input.nonce ?? bytesToBase64Url(hexToBytes(randomHex(16)));
  const plaintext: LoginCredentialPlaintext = {
    v: LOGIN_CREDENTIAL_VERSION,
    typ: LOGIN_CREDENTIAL_TYPE,
    username: input.username,
    password: input.password,
    ts: input.now ?? Date.now(),
    nonce,
  };

  const keyMaterial: LoginCredentialKeyMaterial = { encKey, macKey };
  const keyMaterialCipherHex = sm2.doEncrypt(
    JSON.stringify(keyMaterial),
    input.publicKey,
    LOGIN_CREDENTIAL_SM2_CIPHER_MODE,
  );
  const cipherHex = sm4.encrypt(JSON.stringify(plaintext), encKey, { mode: "cbc", iv: ivHex });
  const envelopeWithoutTag: Omit<LoginCredentialEnvelope, "tag"> = {
    v: LOGIN_CREDENTIAL_VERSION,
    alg: LOGIN_CREDENTIAL_ALG,
    kid: input.kid,
    ek: hexToBase64Url(keyMaterialCipherHex),
    iv: hexToBase64Url(ivHex),
    ct: hexToBase64Url(cipherHex),
  };

  const envelope: LoginCredentialEnvelope = {
    ...envelopeWithoutTag,
    tag: calculateTag(envelopeWithoutTag, macKey),
  };

  return `${LOGIN_CREDENTIAL_PREFIX}.${encodeJson(envelope)}`;
}

export function decryptLoginCredential(
  credential: string,
  privateKeys: Record<string, string>,
): ParsedLoginCredential {
  try {
    const envelope = parseCredentialEnvelope(credential);
    const privateKey = privateKeys[envelope.kid];
    if (!privateKey) {
      throw new LoginCredentialError();
    }

    const keyMaterialText = sm2.doDecrypt(
      base64UrlToHex(envelope.ek),
      privateKey,
      LOGIN_CREDENTIAL_SM2_CIPHER_MODE,
    );
    const keyMaterial = parseKeyMaterial(keyMaterialText);
    const expectedTag = calculateTag({
      v: envelope.v,
      alg: envelope.alg,
      kid: envelope.kid,
      ek: envelope.ek,
      iv: envelope.iv,
      ct: envelope.ct,
    }, keyMaterial.macKey);

    if (!constantTimeEqual(expectedTag, envelope.tag)) {
      throw new LoginCredentialError();
    }

    const plaintextText = sm4.decrypt(
      base64UrlToHex(envelope.ct),
      keyMaterial.encKey,
      { mode: "cbc", iv: base64UrlToHex(envelope.iv) },
    );

    return {
      kid: envelope.kid,
      alg: envelope.alg,
      payload: assertPlaintext(JSON.parse(plaintextText)),
    };
  }
  catch (error) {
    if (error instanceof LoginCredentialError) {
      throw error;
    }
    throw new LoginCredentialError();
  }
}
