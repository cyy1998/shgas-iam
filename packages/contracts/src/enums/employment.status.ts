import type { StatusOption } from "./organization.status";

export enum EmploymentStatus {
  Enable = 1,
  Pause,
  Disable,
  Pending,
}

export const OPEN_EMPLOYMENT_STATUSES = [
  EmploymentStatus.Enable,
  EmploymentStatus.Pause,
  EmploymentStatus.Pending,
] as const;

export function isOpenEmploymentStatus(status: number): status is (typeof OPEN_EMPLOYMENT_STATUSES)[number] {
  return OPEN_EMPLOYMENT_STATUSES.some((openStatus) => openStatus === status);
}

export const employmentStatusToString: Record<EmploymentStatus, string> = {
  [EmploymentStatus.Enable]: "正常",
  [EmploymentStatus.Pause]: "暂停",
  [EmploymentStatus.Disable]: "结束",
  [EmploymentStatus.Pending]: "未启用",
};

export function getEmploymentStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: EmploymentStatus.Enable, color: "success" },
    { label: "暂停", value: EmploymentStatus.Pause, color: "warning" },
    { label: "未启用", value: EmploymentStatus.Pending, color: "default" },
    { label: "结束", value: EmploymentStatus.Disable, color: "default" },
  ];
}
