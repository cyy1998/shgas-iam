export enum OrganizationStatus {
  Enable = 1,
  Pause,
  Disable,
}

export const organizationStatusToString: Record<OrganizationStatus, string> = {
  [OrganizationStatus.Enable]: "正常",
  [OrganizationStatus.Pause]: "暂停",
  [OrganizationStatus.Disable]: "停用",
};

export interface StatusOption {
  label: string;
  value: number;
  color: "success" | "warning" | "default";
}

export function getOrganizationStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: OrganizationStatus.Enable, color: "success" },
    { label: "暂停", value: OrganizationStatus.Pause, color: "warning" },
    { label: "停用", value: OrganizationStatus.Disable, color: "default" },
  ];
}
