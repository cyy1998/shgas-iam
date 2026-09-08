import type { SessionKernelConfig } from "../config";
import { randomBytes } from "node:crypto";

export type KernelTokenKind
  = | "principalSession"
    | "authCode"
    | "localSession"
    | "oidcReturnHandle"
    | "credential"
    | "artifact";

export const MIN_OPAQUE_TOKEN_BYTES = 32;

export function generateOpaqueToken(prefix = "", byteLength = MIN_OPAQUE_TOKEN_BYTES) {
  if (!Number.isInteger(byteLength) || byteLength < MIN_OPAQUE_TOKEN_BYTES)
    throw new Error(`opaque token entropy must be at least ${MIN_OPAQUE_TOKEN_BYTES} bytes`);
  return `${prefix}${base64Url(randomBytes(byteLength))}`;
}

export function generateKernelToken(config: SessionKernelConfig, kind: KernelTokenKind, byteLength?: number) {
  return generateOpaqueToken(config.tokenPrefixes[kind], byteLength);
}

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
