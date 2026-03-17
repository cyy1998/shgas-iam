import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const PositionRoleCreateManyInputObjectSchema: z.ZodType<Prisma.PositionRoleCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateManyInput>;
export const PositionRoleCreateManyInputObjectZodSchema = makeSchema();
