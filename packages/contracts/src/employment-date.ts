import { z } from "zod";

// PostgreSQL date has no year zero.
export const EmploymentDateSchema = z.iso.date().refine((value) => !value.startsWith("0000-"));

export const EMPLOYMENT_TIME_ZONE = "Asia/Shanghai";

const beijingDate = new Intl.DateTimeFormat("en", {
  timeZone: EMPLOYMENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getEmploymentDate(instant: Date): string {
  const { year, month, day } = Object.fromEntries(
    beijingDate.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  return `${year!.padStart(4, "0")}-${month}-${day}`;
}
