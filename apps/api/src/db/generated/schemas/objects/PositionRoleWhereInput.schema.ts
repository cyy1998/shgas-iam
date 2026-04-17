import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const positionrolewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PositionRoleWhereInputObjectSchema), z.lazy(() => PositionRoleWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PositionRoleWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PositionRoleWhereInputObjectSchema), z.lazy(() => PositionRoleWhereInputObjectSchema).array()]).optional(),
  positionId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const PositionRoleWhereInputObjectSchema: z.ZodType<Prisma.PositionRoleWhereInput> = positionrolewhereinputSchema as unknown as z.ZodType<Prisma.PositionRoleWhereInput>;
export const PositionRoleWhereInputObjectZodSchema = positionrolewhereinputSchema;
