import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUpdateOneRequiredWithoutRolesNestedInputObjectSchema as EmploymentUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './EmploymentUpdateOneRequiredWithoutRolesNestedInput.schema'

const makeSchema = () => z.object({
  employment: z.lazy(() => EmploymentUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional()
}).strict();
export const EmploymentRoleUpdateWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateWithoutRoleInput>;
export const EmploymentRoleUpdateWithoutRoleInputObjectZodSchema = makeSchema();
