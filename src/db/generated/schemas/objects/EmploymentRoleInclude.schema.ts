import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentArgsObjectSchema as EmploymentArgsObjectSchema } from './EmploymentArgs.schema';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema'

const makeSchema = () => z.object({
  employment: z.union([z.boolean(), z.lazy(() => EmploymentArgsObjectSchema)]).optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional()
}).strict();
export const EmploymentRoleIncludeObjectSchema: z.ZodType<Prisma.EmploymentRoleInclude> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleInclude>;
export const EmploymentRoleIncludeObjectZodSchema = makeSchema();
