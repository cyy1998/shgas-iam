import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentSelectObjectSchema as EmploymentSelectObjectSchema } from './EmploymentSelect.schema';
import { EmploymentIncludeObjectSchema as EmploymentIncludeObjectSchema } from './EmploymentInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => EmploymentSelectObjectSchema).optional(),
  include: z.lazy(() => EmploymentIncludeObjectSchema).optional()
}).strict();
export const EmploymentArgsObjectSchema = makeSchema();
export const EmploymentArgsObjectZodSchema = makeSchema();
