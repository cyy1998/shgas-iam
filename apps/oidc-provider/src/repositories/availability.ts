import type { OidcClientRuntimeDto } from "@iam/domain/client";
import {
  ClientStatus,
} from "@iam/contracts";

export function isOidcClientAvailable(
  client: Pick<OidcClientRuntimeDto, "status" | "isDelete" | "oidcEnabled" | "oidcConfig">,
) {
  return !client.isDelete
    && (client.status === ClientStatus.Enable || client.status === ClientStatus.Maintenance)
    && client.oidcEnabled
    && client.oidcConfig !== null;
}
