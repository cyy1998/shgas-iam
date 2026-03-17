import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutPositionInputObjectSchema as EmploymentCreateWithoutPositionInputObjectSchema } from './EmploymentCreateWithoutPositionInput.schema';
import { EmploymentUncheckedCreateWithoutPositionInputObjectSchema as EmploymentUncheckedCreateWithoutPositionInputObjectSchema } from './EmploymentUncheckedCreateWithoutPositionInput.schema';
import { EmploymentCreateOrConnectWithoutPositionInputObjectSchema as EmploymentCreateOrConnectWithoutPositionInputObjectSchema } from './EmploymentCreateOrConnectWithoutPositionInput.schema';
import { EmploymentUpsertWithWhereUniqueWithoutPositionInputObjectSchema as EmploymentUpsertWithWhereUniqueWithoutPositionInputObjectSchema } from './EmploymentUpsertWithWhereUniqueWithoutPositionInput.schema';
import { EmploymentCreateManyPositionInputEnvelopeObjectSchema as EmploymentCreateManyPositionInputEnvelopeObjectSchema } from './EmploymentCreateManyPositionInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateWithWhereUniqueWithoutPositionInputObjectSchema as EmploymentUpdateWithWhereUniqueWithoutPositionInputObjectSchema } from './EmploymentUpdateWithWhereUniqueWithoutPositionInput.schema';
import { EmploymentUpdateManyWithWhereWithoutPositionInputObjectSchema as EmploymentUpdateManyWithWhereWithoutPositionInputObjectSchema } from './EmploymentUpdateManyWithWhereWithoutPositionInput.schema';
import { EmploymentScalarWhereInputObjectSchema as EmploymentScalarWhereInputObjectSchema } from './EmploymentScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutPositionInputObjectSchema), z.lazy(() => EmploymentCreateWithoutPositionInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutPositionInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutPositionInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutPositionInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUpsertWithWhereUniqueWithoutPositionInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyPositionInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUpdateWithWhereUniqueWithoutPositionInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => EmploymentUpdateManyWithWhereWithoutPositionInputObjectSchema), z.lazy(() => EmploymentUpdateManyWithWhereWithoutPositionInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => EmploymentScalarWhereInputObjectSchema), z.lazy(() => EmploymentScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentUncheckedUpdateManyWithoutPositionNestedInputObjectSchema: z.ZodType<Prisma.EmploymentUncheckedUpdateManyWithoutPositionNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUncheckedUpdateManyWithoutPositionNestedInput>;
export const EmploymentUncheckedUpdateManyWithoutPositionNestedInputObjectZodSchema = makeSchema();
