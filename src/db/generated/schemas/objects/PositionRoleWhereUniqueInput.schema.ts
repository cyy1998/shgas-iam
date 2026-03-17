import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRolePositionIdRoleIdCompoundUniqueInputObjectSchema as PositionRolePositionIdRoleIdCompoundUniqueInputObjectSchema } from './PositionRolePositionIdRoleIdCompoundUniqueInput.schema'

const makeSchema = () => z.object({
  positionId_roleId: z.lazy(() => PositionRolePositionIdRoleIdCompoundUniqueInputObjectSchema).optional()
}).strict();
export const PositionRoleWhereUniqueInputObjectSchema: z.ZodType<Prisma.PositionRoleWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleWhereUniqueInput>;
export const PositionRoleWhereUniqueInputObjectZodSchema = makeSchema();
