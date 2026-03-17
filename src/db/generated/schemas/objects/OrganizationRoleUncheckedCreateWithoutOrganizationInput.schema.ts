import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int(),
  isAllSub: z.boolean().optional()
}).strict();
export const OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUncheckedCreateWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUncheckedCreateWithoutOrganizationInput>;
export const OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectZodSchema = makeSchema();
