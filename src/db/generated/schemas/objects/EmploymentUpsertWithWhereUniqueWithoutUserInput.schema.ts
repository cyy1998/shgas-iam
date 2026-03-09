import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutUserInputObjectSchema as EmploymentUpdateWithoutUserInputObjectSchema } from './EmploymentUpdateWithoutUserInput.schema';
import { EmploymentUncheckedUpdateWithoutUserInputObjectSchema as EmploymentUncheckedUpdateWithoutUserInputObjectSchema } from './EmploymentUncheckedUpdateWithoutUserInput.schema';
import { EmploymentCreateWithoutUserInputObjectSchema as EmploymentCreateWithoutUserInputObjectSchema } from './EmploymentCreateWithoutUserInput.schema';
import { EmploymentUncheckedCreateWithoutUserInputObjectSchema as EmploymentUncheckedCreateWithoutUserInputObjectSchema } from './EmploymentUncheckedCreateWithoutUserInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => EmploymentUpdateWithoutUserInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutUserInputObjectSchema)]),
  create: z.union([z.lazy(() => EmploymentCreateWithoutUserInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutUserInputObjectSchema)])
}).strict();
export const EmploymentUpsertWithWhereUniqueWithoutUserInputObjectSchema: z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutUserInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutUserInput>;
export const EmploymentUpsertWithWhereUniqueWithoutUserInputObjectZodSchema = makeSchema();
