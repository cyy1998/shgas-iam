import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleSelectObjectSchema as EmploymentRoleSelectObjectSchema } from './EmploymentRoleSelect.schema';
import { EmploymentRoleIncludeObjectSchema as EmploymentRoleIncludeObjectSchema } from './EmploymentRoleInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => EmploymentRoleSelectObjectSchema).optional(),
  include: z.lazy(() => EmploymentRoleIncludeObjectSchema).optional()
}).strict();
export const EmploymentRoleArgsObjectSchema = makeSchema();
export const EmploymentRoleArgsObjectZodSchema = makeSchema();
