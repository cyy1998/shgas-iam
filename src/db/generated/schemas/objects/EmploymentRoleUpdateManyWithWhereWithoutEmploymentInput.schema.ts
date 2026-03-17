import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleScalarWhereInputObjectSchema as EmploymentRoleScalarWhereInputObjectSchema } from './EmploymentRoleScalarWhereInput.schema';
import { EmploymentRoleUpdateManyMutationInputObjectSchema as EmploymentRoleUpdateManyMutationInputObjectSchema } from './EmploymentRoleUpdateManyMutationInput.schema';
import { EmploymentRoleUncheckedUpdateManyWithoutEmploymentInputObjectSchema as EmploymentRoleUncheckedUpdateManyWithoutEmploymentInputObjectSchema } from './EmploymentRoleUncheckedUpdateManyWithoutEmploymentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentRoleUpdateManyMutationInputObjectSchema), z.lazy(() => EmploymentRoleUncheckedUpdateManyWithoutEmploymentInputObjectSchema)])
}).strict();
export const EmploymentRoleUpdateManyWithWhereWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateManyWithWhereWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateManyWithWhereWithoutEmploymentInput>;
export const EmploymentRoleUpdateManyWithWhereWithoutEmploymentInputObjectZodSchema = makeSchema();
