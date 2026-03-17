import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional()
}).strict();
export const RolePrivilegeMaxAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeMaxAggregateInputType>;
export const RolePrivilegeMaxAggregateInputObjectZodSchema = makeSchema();
