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
