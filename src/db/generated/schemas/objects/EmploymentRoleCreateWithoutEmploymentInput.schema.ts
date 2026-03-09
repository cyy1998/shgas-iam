import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateNestedOneWithoutEmploymentsInputObjectSchema as RoleCreateNestedOneWithoutEmploymentsInputObjectSchema } from './RoleCreateNestedOneWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleCreateNestedOneWithoutEmploymentsInputObjectSchema)
}).strict();
export const EmploymentRoleCreateWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateWithoutEmploymentInput>;
export const EmploymentRoleCreateWithoutEmploymentInputObjectZodSchema = makeSchema();
