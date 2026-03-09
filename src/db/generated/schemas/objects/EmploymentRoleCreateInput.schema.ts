import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedOneWithoutRolesInputObjectSchema as EmploymentCreateNestedOneWithoutRolesInputObjectSchema } from './EmploymentCreateNestedOneWithoutRolesInput.schema';
import { RoleCreateNestedOneWithoutEmploymentsInputObjectSchema as RoleCreateNestedOneWithoutEmploymentsInputObjectSchema } from './RoleCreateNestedOneWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  employment: z.lazy(() => EmploymentCreateNestedOneWithoutRolesInputObjectSchema),
  role: z.lazy(() => RoleCreateNestedOneWithoutEmploymentsInputObjectSchema)
}).strict();
export const EmploymentRoleCreateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateInput>;
export const EmploymentRoleCreateInputObjectZodSchema = makeSchema();
