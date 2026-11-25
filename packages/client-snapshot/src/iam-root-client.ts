import { ClientSsoProtocol, ClientStatus } from "@iam/contracts";
import type { ClientSnapshotReader } from "./contract";

export async function acquireIamRootClient(clients: ClientSnapshotReader) {
  const snapshot = await clients.acquire("iam");
  if (snapshot.kind !== "present" || snapshot.value.clientCode !== "iam") return { kind: "rejected" } as const;
  const { status, ssoEnabled, ssoConfig } = snapshot.value;
  if (status === ClientStatus.Maintenance) return { kind: "maintenance" } as const;
  if (status !== ClientStatus.Enable || !ssoEnabled || ssoConfig?.protocol !== ClientSsoProtocol.CustomSso)
    return { kind: "rejected" } as const;
  return { kind: "accepted", config: ssoConfig } as const;
}
