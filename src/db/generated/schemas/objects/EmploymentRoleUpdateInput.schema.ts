import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentUpdateOneRequiredWithoutRolesNestedInputObjectSchema as EmploymentUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './EmploymentUpdateOneRequiredWithoutRolesNestedInput.schema';
import { RoleUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema as RoleUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutEmploymentsNestedInput.schema'

const makeSchema = () => z.object({
  employment: z.lazy(() => EmploymentUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional(),
  role: z.lazy(() => RoleUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema).optional()
}).strict();
export const EmploymentRoleUpdateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateInput>;
export const EmploymentRoleUpdateInputObjectZodSchema = makeSchema();
