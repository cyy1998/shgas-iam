import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema';
import { EmploymentUpdateManyMutationInputObjectSchema as EmploymentUpdateManyMutationInputObjectSchema } from './EmploymentUpdateManyMutationInput.schema';
import { EmploymentUncheckedUpdateManyWithoutUserInputObjectSchema as EmploymentUncheckedUpdateManyWithoutUserInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateManyMutationInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateManyWithoutUserInputObjectSchema)])
}).strict();
export const EmploymentUpdateManyWithWhereWithoutUserInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutUserInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutUserInput>;
export const EmploymentUpdateManyWithWhereWithoutUserInputObjectZodSchema = makeSchema();
