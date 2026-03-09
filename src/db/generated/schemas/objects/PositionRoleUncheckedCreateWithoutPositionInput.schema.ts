import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const PositionRoleUncheckedCreateWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedCreateWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedCreateWithoutPositionInput>;
export const PositionRoleUncheckedCreateWithoutPositionInputObjectZodSchema = makeSchema();
