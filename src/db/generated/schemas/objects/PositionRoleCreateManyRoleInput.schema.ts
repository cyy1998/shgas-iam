import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.number().int()
}).strict();
export const PositionRoleCreateManyRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleCreateManyRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateManyRoleInput>;
export const PositionRoleCreateManyRoleInputObjectZodSchema = makeSchema();
