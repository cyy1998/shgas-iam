import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int(),
  isAllSub: z.boolean().optional()
}).strict();
export const OrganizationRoleCreateManyOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateManyOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateManyOrganizationInput>;
export const OrganizationRoleCreateManyOrganizationInputObjectZodSchema = makeSchema();
