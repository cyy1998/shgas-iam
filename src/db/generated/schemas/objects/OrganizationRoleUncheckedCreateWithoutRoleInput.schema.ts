import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.number().int(),
  isAllSub: z.boolean().optional()
}).strict();
export const OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUncheckedCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUncheckedCreateWithoutRoleInput>;
export const OrganizationRoleUncheckedCreateWithoutRoleInputObjectZodSchema = makeSchema();
