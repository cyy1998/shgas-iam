import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutUserInputObjectSchema as EmploymentCreateWithoutUserInputObjectSchema } from './EmploymentCreateWithoutUserInput.schema';
import { EmploymentUncheckedCreateWithoutUserInputObjectSchema as EmploymentUncheckedCreateWithoutUserInputObjectSchema } from './EmploymentUncheckedCreateWithoutUserInput.schema';
import { EmploymentCreateOrConnectWithoutUserInputObjectSchema as EmploymentCreateOrConnectWithoutUserInputObjectSchema } from './EmploymentCreateOrConnectWithoutUserInput.schema';
import { EmploymentUpsertWithWhereUniqueWithoutUserInputObjectSchema as EmploymentUpsertWithWhereUniqueWithoutUserInputObjectSchema } from './EmploymentUpsertWithWhereUniqueWithoutUserInput.schema';
import { EmploymentCreateManyUserInputEnvelopeObjectSchema as EmploymentCreateManyUserInputEnvelopeObjectSchema } from './EmploymentCreateManyUserInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithWhereUniqueWithoutUserInputObjectSchema as EmploymentUpdateWithWhereUniqueWithoutUserInputObjectSchema } from './EmploymentUpdateWithWhereUniqueWithoutUserInput.schema';
import { EmploymentUpdateManyWithWhereWithoutUserInputObjectSchema as EmploymentUpdateManyWithWhereWithoutUserInputObjectSchema } from './EmploymentUpdateManyWithWhereWithoutUserInput.schema';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutUserInputObjectSchema), z.lazy(() => EmploymentCreateWithoutUserInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutUserInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutUserInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutUserInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutUserInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutUserInputObjectSchema), z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutUserInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyUserInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutUserInputObjectSchema), z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutUserInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => EmploymentUpdateManyWithWhereWithoutUserInputObjectSchema), z.lazy(() => EmploymentUpdateManyWithWhereWithoutUserInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => EmploymentScalarWhereInputObjectSchema), z.lazy(() => EmploymentScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentUncheckedUpdateManyWithoutUserNestedInputObjectSchema: z.ZodType<Prisma.EmploymentUncheckedUpdateManyWithoutUserNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUncheckedUpdateManyWithoutUserNestedInput>;
export const EmploymentUncheckedUpdateManyWithoutUserNestedInputObjectZodSchema = makeSchema();
