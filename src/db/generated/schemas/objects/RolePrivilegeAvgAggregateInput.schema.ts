import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional()
}).strict();
export const RolePrivilegeAvgAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeAvgAggregateInputType>;
export const RolePrivilegeAvgAggregateInputObjectZodSchema = makeSchema();
