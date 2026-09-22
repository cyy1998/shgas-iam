import type { StatusOption } from "./organization.status";

export enum UserStatus {
  Enable = 1,
  Pause,
  Disable,
}

export const userStatusToString: Record<UserStatus, string> = {
  [UserStatus.Enable]: "正常",
  [UserStatus.Pause]: "暂停",
  [UserStatus.Disable]: "停用",
};

export function getUserStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: UserStatus.Enable, color: "success" },
    { label: "暂停", value: UserStatus.Pause, color: "warning" },
    { label: "停用", value: UserStatus.Disable, color: "default" },
  ];
}
