import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const positionrolescalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => PositionRoleScalarWhereInputObjectSchema), z.lazy(() => PositionRoleScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => PositionRoleScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => PositionRoleScalarWhereInputObjectSchema), z.lazy(() => PositionRoleScalarWhereInputObjectSchema).array()]).optional(),
  positionId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const PositionRoleScalarWhereInputObjectSchema: z.ZodType<Prisma.PositionRoleScalarWhereInput> = positionrolescalarwhereinputSchema as unknown as z.ZodType<Prisma.PositionRoleScalarWhereInput>;
export const PositionRoleScalarWhereInputObjectZodSchema = positionrolescalarwhereinputSchema;
