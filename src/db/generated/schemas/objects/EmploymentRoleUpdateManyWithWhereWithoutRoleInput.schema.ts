import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleScalarWhereInputObjectSchema as EmploymentRoleScalarWhereInputObjectSchema } from './EmploymentRoleScalarWhereInput.schema';
import { EmploymentRoleUpdateManyMutationInputObjectSchema as EmploymentRoleUpdateManyMutationInputObjectSchema } from './EmploymentRoleUpdateManyMutationInput.schema';
import { EmploymentRoleUncheckedUpdateManyWithoutRoleInputObjectSchema as EmploymentRoleUncheckedUpdateManyWithoutRoleInputObjectSchema } from './EmploymentRoleUncheckedUpdateManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentRoleUpdateManyMutationInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedUpdateManyWithoutRoleInputObjectSchema)])
}).strict();
export const EmploymentRoleUpdateManyWithWhereWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateManyWithWhereWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateManyWithWhereWithoutRoleInput>;
export const EmploymentRoleUpdateManyWithWhereWithoutRoleInputObjectZodSchema = makeSchema();
