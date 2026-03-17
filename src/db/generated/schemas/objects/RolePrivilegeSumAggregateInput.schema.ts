import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional()
}).strict();
export const RolePrivilegeSumAggregateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeSumAggregateInputType>;
export const RolePrivilegeSumAggregateInputObjectZodSchema = makeSchema();
