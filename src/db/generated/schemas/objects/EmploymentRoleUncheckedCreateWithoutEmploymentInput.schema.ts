import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUncheckedCreateWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUncheckedCreateWithoutEmploymentInput>;
export const EmploymentRoleUncheckedCreateWithoutEmploymentInputObjectZodSchema = makeSchema();
