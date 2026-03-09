import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentArgsObjectSchema as EmploymentArgsObjectSchema } from './EmploymentArgs.schema';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema'

const makeSchema = () => z.object({
  employmentId: z.boolean().optional(),
  roleId: z.boolean().optional(),
  employment: z.union([z.boolean(), z.lazy(() => EmploymentArgsObjectSchema)]).optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional()
}).strict();
export const EmploymentRoleSelectObjectSchema: z.ZodType<Prisma.EmploymentRoleSelect> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleSelect>;
export const EmploymentRoleSelectObjectZodSchema = makeSchema();
