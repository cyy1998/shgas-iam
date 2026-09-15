import type { ClientSsoConfig } from "@iam/contracts";
import type { ClientSsoAdminRecordSchema } from "@iam/domain/client";
import type { z } from "zod";
import type { ClientSsoSaveSchema } from "./client-sso.schema";

export type ClientSsoRecord = z.infer<typeof ClientSsoAdminRecordSchema>;
export type ClientSsoSave = z.infer<typeof ClientSsoSaveSchema>;
export interface ClientSsoStorageUpdate extends ClientSsoSave {
  isDelete?: boolean;
  ssoConfig?: ClientSsoConfig | null;
  ssoEnabled?: boolean;
  ssoSecret?: string;
  ssoCredentialId?: string;
  ssoSecretUpdatedAt?: string;
}
