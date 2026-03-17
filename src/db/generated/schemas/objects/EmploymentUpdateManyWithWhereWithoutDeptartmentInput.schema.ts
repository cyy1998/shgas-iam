import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema';
import { EmploymentUpdateManyMutationInputObjectSchema as EmploymentUpdateManyMutationInputObjectSchema } from './EmploymentUpdateManyMutationInput.schema';
import { EmploymentUncheckedUpdateManyWithoutDeptartmentInputObjectSchema as EmploymentUncheckedUpdateManyWithoutDeptartmentInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutDeptartmentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateManyMutationInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateManyWithoutDeptartmentInputObjectSchema)])
}).strict();
export const EmploymentUpdateManyWithWhereWithoutDeptartmentInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutDeptartmentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutDeptartmentInput>;
export const EmploymentUpdateManyWithWhereWithoutDeptartmentInputObjectZodSchema = makeSchema();
