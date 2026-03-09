import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedOneWithoutRolesInputObjectSchema as EmploymentCreateNestedOneWithoutRolesInputObjectSchema } from './EmploymentCreateNestedOneWithoutRolesInput.schema'

const makeSchema = () => z.object({
  employment: z.lazy(() => EmploymentCreateNestedOneWithoutRolesInputObjectSchema)
}).strict();
export const EmploymentRoleCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateWithoutRoleInput>;
export const EmploymentRoleCreateWithoutRoleInputObjectZodSchema = makeSchema();
