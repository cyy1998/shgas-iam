import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.number().int()
}).strict();
export const EmploymentRoleUncheckedCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUncheckedCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUncheckedCreateWithoutRoleInput>;
export const EmploymentRoleUncheckedCreateWithoutRoleInputObjectZodSchema = makeSchema();
