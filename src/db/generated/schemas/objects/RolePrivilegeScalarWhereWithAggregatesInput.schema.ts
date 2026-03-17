import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema'

const roleprivilegescalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => RolePrivilegeScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => RolePrivilegeScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => RolePrivilegeScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => RolePrivilegeScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => RolePrivilegeScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  roleId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  privilegeId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const RolePrivilegeScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.RolePrivilegeScalarWhereWithAggregatesInput> = roleprivilegescalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.RolePrivilegeScalarWhereWithAggregatesInput>;
export const RolePrivilegeScalarWhereWithAggregatesInputObjectZodSchema = roleprivilegescalarwherewithaggregatesinputSchema;
