import type { ClientSnapshotReader } from "./contract";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ClientCredentialValueSchema = z.object({
  secret: z.string().min(1),
  credentialId: z.uuid(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ClientCredentialValue = z.infer<typeof ClientCredentialValueSchema>;
export type ClientCredentialReader
  = ClientSnapshotReader<ClientCredentialValue>;
export interface ClientCredentialSource {
  readonly loadCredential: (clientCode: string) => Promise<unknown | null>;
}

/** Authentication owners keep the accepted result for their operation; no revalidation at delivery. */
export function createClientSecretAuthenticator(reader: ClientCredentialReader) {
  return {
    async authenticate(clientCode: string, secret: string) {
      const observed = await reader.acquire(clientCode);
      if (observed.kind === "absent")
        return null;
      const digest = (value: string) => createHash("sha256").update(value).digest();
      if (!timingSafeEqual(digest(secret), digest(observed.value.secret)))
        return null;
      return { clientCode, credentialId: observed.value.credentialId, updatedAt: observed.value.updatedAt };
    },
  };
}
