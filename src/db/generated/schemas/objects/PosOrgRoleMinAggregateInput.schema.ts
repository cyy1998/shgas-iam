import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const PosOrgRoleMinAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleMinAggregateInputType>;
export const PosOrgRoleMinAggregateInputObjectZodSchema = makeSchema();
