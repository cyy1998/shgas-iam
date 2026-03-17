import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema as RoleUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutEmploymentsNestedInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema).optional()
}).strict();
export const EmploymentRoleUpdateWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateWithoutEmploymentInput>;
export const EmploymentRoleUpdateWithoutEmploymentInputObjectZodSchema = makeSchema();
