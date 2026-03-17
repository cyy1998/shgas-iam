import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.literal(true).optional(),
  roleId: z.literal(true).optional(),
  isAllSub: z.literal(true).optional()
}).strict();
export const OrganizationRoleMaxAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleMaxAggregateInputType>;
export const OrganizationRoleMaxAggregateInputObjectZodSchema = makeSchema();
