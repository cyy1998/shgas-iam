import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const PositionRoleUncheckedCreateInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedCreateInput>;
export const PositionRoleUncheckedCreateInputObjectZodSchema = makeSchema();
