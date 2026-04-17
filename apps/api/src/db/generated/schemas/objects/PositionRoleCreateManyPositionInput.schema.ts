import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const PositionRoleCreateManyPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleCreateManyPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateManyPositionInput>;
export const PositionRoleCreateManyPositionInputObjectZodSchema = makeSchema();
