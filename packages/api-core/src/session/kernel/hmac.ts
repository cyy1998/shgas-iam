import type { SessionKernelConfig, SessionKernelHmacKey } from "./config";
import { createHmac } from "node:crypto";

export type LookupHashCandidate = {
  keyId: string;
  lookupHash: string;
};

export function createLookupHash(externalToken: string, key: SessionKernelHmacKey) {
  return base64Url(createHmac("sha256", key.secret).update(externalToken).digest());
}

export function createCurrentLookupHash(externalToken: string, config: SessionKernelConfig): LookupHashCandidate {
  const key = config.lookupHmacKeys.current;
  return { keyId: key.id, lookupHash: createLookupHash(externalToken, key) };
}

export function createLookupHashCandidates(externalToken: string, config: SessionKernelConfig): LookupHashCandidate[] {
  const current = createCurrentLookupHash(externalToken, config);
  const previous = config.lookupHmacKeys.previous
    ? {
        keyId: config.lookupHmacKeys.previous.id,
        lookupHash: createLookupHash(externalToken, config.lookupHmacKeys.previous),
      }
    : undefined;
  return previous ? [current, previous] : [current];
}

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
