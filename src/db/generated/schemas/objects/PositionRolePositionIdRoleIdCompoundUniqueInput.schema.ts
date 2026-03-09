import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const PositionRolePositionIdRoleIdCompoundUniqueInputObjectSchema: z.ZodType<Prisma.PositionRolePositionIdRoleIdCompoundUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRolePositionIdRoleIdCompoundUniqueInput>;
export const PositionRolePositionIdRoleIdCompoundUniqueInputObjectZodSchema = makeSchema();
