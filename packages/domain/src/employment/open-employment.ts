import { EmploymentStatus } from "@iam/contracts";

export const OPEN_EMPLOYMENT_STATUSES = [
  EmploymentStatus.Enable,
  EmploymentStatus.Pause,
] as const;
