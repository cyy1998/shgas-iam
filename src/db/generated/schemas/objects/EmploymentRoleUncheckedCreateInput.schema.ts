import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const EmploymentRoleUncheckedCreateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUncheckedCreateInput>;
export const EmploymentRoleUncheckedCreateInputObjectZodSchema = makeSchema();
