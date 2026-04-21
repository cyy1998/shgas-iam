import type { StatusOption } from "./organization.status";

export enum EmploymentStatus {
  Enable = 1,
  Pause,
  Disable,
}

export const employmentStatusToString: Record<EmploymentStatus, string> = {
  [EmploymentStatus.Enable]: "正常",
  [EmploymentStatus.Pause]: "暂停",
  [EmploymentStatus.Disable]: "结束",
};

export function getEmploymentStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: EmploymentStatus.Enable, color: "success" },
    { label: "暂停", value: EmploymentStatus.Pause, color: "warning" },
    { label: "结束", value: EmploymentStatus.Disable, color: "default" },
  ];
}
