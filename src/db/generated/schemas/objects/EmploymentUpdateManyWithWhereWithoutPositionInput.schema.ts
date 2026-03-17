import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema';
import { EmploymentUpdateManyMutationInputObjectSchema as EmploymentUpdateManyMutationInputObjectSchema } from './EmploymentUpdateManyMutationInput.schema';
import { EmploymentUncheckedUpdateManyWithoutPositionInputObjectSchema as EmploymentUncheckedUpdateManyWithoutPositionInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateManyMutationInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateManyWithoutPositionInputObjectSchema)])
}).strict();
export const EmploymentUpdateManyWithWhereWithoutPositionInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutPositionInput>;
export const EmploymentUpdateManyWithWhereWithoutPositionInputObjectZodSchema = makeSchema();
