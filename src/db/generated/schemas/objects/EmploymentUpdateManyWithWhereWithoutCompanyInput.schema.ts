import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema';
import { EmploymentUpdateManyMutationInputObjectSchema as EmploymentUpdateManyMutationInputObjectSchema } from './EmploymentUpdateManyMutationInput.schema';
import { EmploymentUncheckedUpdateManyWithoutCompanyInputObjectSchema as EmploymentUncheckedUpdateManyWithoutCompanyInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutCompanyInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateManyMutationInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateManyWithoutCompanyInputObjectSchema)])
}).strict();
export const EmploymentUpdateManyWithWhereWithoutCompanyInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutCompanyInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutCompanyInput>;
export const EmploymentUpdateManyWithWhereWithoutCompanyInputObjectZodSchema = makeSchema();
