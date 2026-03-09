import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema';
import { EmploymentUpdateManyMutationInputObjectSchema as EmploymentUpdateManyMutationInputObjectSchema } from './EmploymentUpdateManyMutationInput.schema';
import { EmploymentUncheckedUpdateManyWithoutPosOrgInputObjectSchema as EmploymentUncheckedUpdateManyWithoutPosOrgInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateManyMutationInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateManyWithoutPosOrgInputObjectSchema)])
}).strict();
export const EmploymentUpdateManyWithWhereWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateManyWithWhereWithoutPosOrgInput>;
export const EmploymentUpdateManyWithWhereWithoutPosOrgInputObjectZodSchema = makeSchema();
