import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.number().int(),
  roleId: z.number().int(),
  isAllSub: z.boolean().optional()
}).strict();
export const OrganizationRoleUncheckedCreateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUncheckedCreateInput>;
export const OrganizationRoleUncheckedCreateInputObjectZodSchema = makeSchema();
