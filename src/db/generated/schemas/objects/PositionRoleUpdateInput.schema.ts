import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const PositionRoleUpdateInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateInput>;
export const PositionRoleUpdateInputObjectZodSchema = makeSchema();
