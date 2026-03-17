import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCountOutputTypeSelectObjectSchema as EmploymentCountOutputTypeSelectObjectSchema } from './EmploymentCountOutputTypeSelect.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => EmploymentCountOutputTypeSelectObjectSchema).optional()
}).strict();
export const EmploymentCountOutputTypeArgsObjectSchema = makeSchema();
export const EmploymentCountOutputTypeArgsObjectZodSchema = makeSchema();
