import { EmploymentDateSchema, EmploymentStatus } from "@iam/contracts";
import { EmploymentInvalidPeriodError } from "./errors";

export { EMPLOYMENT_TIME_ZONE, getEmploymentDate } from "@iam/contracts";

export interface EmploymentPeriod {
  startTime: string | null;
  endTime: string | null;
}

export function assertValidEmploymentPeriod({ startTime, endTime }: EmploymentPeriod): void {
  if (
    (startTime !== null && !EmploymentDateSchema.safeParse(startTime).success) ||
    (endTime !== null && !EmploymentDateSchema.safeParse(endTime).success)
  ) {
    throw new EmploymentInvalidPeriodError("任职日期须为有效的 YYYY-MM-DD 日期");
  }
  if (startTime !== null && endTime !== null && startTime >= endTime) {
    throw new EmploymentInvalidPeriodError("任职开始日必须早于截止日");
  }
}

/** The caller decides whether the current lifecycle permits a date-driven change. */
export function getEmploymentStatusForDate(
  { startTime, endTime }: EmploymentPeriod,
  operationDate: string,
  { preservePause = false }: { preservePause?: boolean } = {},
): EmploymentStatus {
  if (endTime !== null && endTime <= operationDate) return EmploymentStatus.Disable;
  if (preservePause) return EmploymentStatus.Pause;
  return startTime !== null && startTime > operationDate ? EmploymentStatus.Pending : EmploymentStatus.Enable;
}
