import { randomBytes, timingSafeEqual } from "node:crypto";

export type OidcReturnHandlePayload = {
  interactionUid: string;
  clientId: string;
  oidcConfigVersion: number;
  browserBinding: string;
};

export function createOpaqueValue() {
  return randomBytes(32).toString("base64url");
}

export function secureStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
