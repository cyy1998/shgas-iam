import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleWhereInputObjectSchema as EmploymentRoleWhereInputObjectSchema } from './EmploymentRoleWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => EmploymentRoleWhereInputObjectSchema).optional(),
  some: z.lazy(() => EmploymentRoleWhereInputObjectSchema).optional(),
  none: z.lazy(() => EmploymentRoleWhereInputObjectSchema).optional()
}).strict();
export const EmploymentRoleListRelationFilterObjectSchema: z.ZodType<Prisma.EmploymentRoleListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleListRelationFilter>;
export const EmploymentRoleListRelationFilterObjectZodSchema = makeSchema();
