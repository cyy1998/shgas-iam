import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const OrganizationRoleSumAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleSumAggregateInputType>;
export const OrganizationRoleSumAggregateInputObjectZodSchema = makeSchema();
