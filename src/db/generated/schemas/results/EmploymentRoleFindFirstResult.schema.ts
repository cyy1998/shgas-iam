import * as z from 'zod';
export const EmploymentRoleFindFirstResultSchema = z.nullable(z.object({
  employmentId: z.number().int(),
  roleId: z.number().int(),
  employment: z.unknown(),
  role: z.unknown()
}));