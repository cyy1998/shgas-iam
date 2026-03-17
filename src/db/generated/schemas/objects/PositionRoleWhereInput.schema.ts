import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { PositionScalarRelationFilterObjectSchema as PositionScalarRelationFilterObjectSchema } from './PositionScalarRelationFilter.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema';
import { RoleScalarRelationFilterObjectSchema as RoleScalarRelationFilterObjectSchema } from './RoleScalarRelationFilter.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const positionrolewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PositionRoleWhereInputObjectSchema), z.lazy(() => PositionRoleWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PositionRoleWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PositionRoleWhereInputObjectSchema), z.lazy(() => PositionRoleWhereInputObjectSchema).array()]).optional(),
  positionId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  position: z.union([z.lazy(() => PositionScalarRelationFilterObjectSchema), z.lazy(() => PositionWhereInputObjectSchema)]).optional(),
  role: z.union([z.lazy(() => RoleScalarRelationFilterObjectSchema), z.lazy(() => RoleWhereInputObjectSchema)]).optional()
}).strict();
export const PositionRoleWhereInputObjectSchema: z.ZodType<Prisma.PositionRoleWhereInput> = positionrolewhereinputSchema as unknown as z.ZodType<Prisma.PositionRoleWhereInput>;
export const PositionRoleWhereInputObjectZodSchema = positionrolewhereinputSchema;
