import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.literal(true).optional(),
  roleId: z.literal(true).optional(),
  isAllSub: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const OrganizationRoleCountAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCountAggregateInputType>;
export const OrganizationRoleCountAggregateInputObjectZodSchema = makeSchema();
