import type { StatusOption } from "./organization.status";

export enum RoleStatus {
  Enable = 1,
  Pause,
  Disable,
}

export const roleStatusToString: Record<RoleStatus, string> = {
  [RoleStatus.Enable]: "正常",
  [RoleStatus.Pause]: "暂停",
  [RoleStatus.Disable]: "停用",
};

export function getRoleStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: RoleStatus.Enable, color: "success" },
    { label: "暂停", value: RoleStatus.Pause, color: "warning" },
    { label: "停用", value: RoleStatus.Disable, color: "default" },
  ];
}
