import { z } from "zod";

// PostgreSQL date has no year zero.
export const EmploymentDateSchema = z.iso.date().refine((value) => !value.startsWith("0000-"));
