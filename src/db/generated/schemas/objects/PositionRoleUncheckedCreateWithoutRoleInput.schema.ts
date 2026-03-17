import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.number().int()
}).strict();
export const PositionRoleUncheckedCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedCreateWithoutRoleInput>;
export const PositionRoleUncheckedCreateWithoutRoleInputObjectZodSchema = makeSchema();
