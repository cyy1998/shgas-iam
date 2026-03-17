import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithoutPositionInputObjectSchema as EmploymentUpdateWithoutPositionInputObjectSchema } from './EmploymentUpdateWithoutPositionInput.schema';
import { EmploymentUncheckedUpdateWithoutPositionInputObjectSchema as EmploymentUncheckedUpdateWithoutPositionInputObjectSchema } from './EmploymentUncheckedUpdateWithoutPositionInput.schema';
import { EmploymentCreateWithoutPositionInputObjectSchema as EmploymentCreateWithoutPositionInputObjectSchema } from './EmploymentCreateWithoutPositionInput.schema';
import { EmploymentUncheckedCreateWithoutPositionInputObjectSchema as EmploymentUncheckedCreateWithoutPositionInputObjectSchema } from './EmploymentUncheckedCreateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => EmploymentWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => EmploymentUpdateWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutPositionInputObjectSchema)]),
  create: z.union([z.lazy(() => EmploymentCreateWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutPositionInputObjectSchema)])
}).strict();
export const EmploymentUpsertWithWhereUniqueWithoutPositionInputObjectSchema: z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpsertWithWhereUniqueWithoutPositionInput>;
export const EmploymentUpsertWithWhereUniqueWithoutPositionInputObjectZodSchema = makeSchema();
