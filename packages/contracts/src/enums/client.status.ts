import type { StatusOption } from "./organization.status";

export enum ClientStatus {
  Enable = 1,
  Maintenance,
  Disable,
}

export const clientStatusToString: Record<ClientStatus, string> = {
  [ClientStatus.Enable]: "正常",
  [ClientStatus.Maintenance]: "维护中",
  [ClientStatus.Disable]: "停用",
};

export function getClientStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: ClientStatus.Enable, color: "success" },
    { label: "维护中", value: ClientStatus.Maintenance, color: "warning" },
    { label: "停用", value: ClientStatus.Disable, color: "default" },
  ];
}
