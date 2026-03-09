import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutUserInputObjectSchema as EmploymentUpdateWithoutUserInputObjectSchema } from './EmploymentUpdateWithoutUserInput.schema';
import { EmploymentUncheckedUpdateWithoutUserInputObjectSchema as EmploymentUncheckedUpdateWithoutUserInputObjectSchema } from './EmploymentUncheckedUpdateWithoutUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => EmploymentUpdateWithoutUserInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutUserInputObjectSchema)])
}).strict();
export const EmploymentUpdateWithWhereUniqueWithoutUserInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutUserInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateWithWhereUniqueWithoutUserInput>;
export const EmploymentUpdateWithWhereUniqueWithoutUserInputObjectZodSchema = makeSchema();
