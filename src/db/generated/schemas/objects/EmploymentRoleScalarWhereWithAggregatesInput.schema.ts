import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntWithAggregatesFilterObjectSchema as IntWithAggregatesFilterObjectSchema } from './IntWithAggregatesFilter.schema'

const employmentrolescalarwherewithaggregatesinputSchema = z.object({
  AND: z.union([z.lazy(() => EmploymentRoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => EmploymentRoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => EmploymentRoleScalarWhereWithAggregatesInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => EmploymentRoleScalarWhereWithAggregatesInputObjectSchema), z.lazy(() => EmploymentRoleScalarWhereWithAggregatesInputObjectSchema).array()]).optional(),
  employmentId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntWithAggregatesFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const EmploymentRoleScalarWhereWithAggregatesInputObjectSchema: z.ZodType<Prisma.EmploymentRoleScalarWhereWithAggregatesInput> = employmentrolescalarwherewithaggregatesinputSchema as unknown as z.ZodType<Prisma.EmploymentRoleScalarWhereWithAggregatesInput>;
export const EmploymentRoleScalarWhereWithAggregatesInputObjectZodSchema = employmentrolescalarwherewithaggregatesinputSchema;
