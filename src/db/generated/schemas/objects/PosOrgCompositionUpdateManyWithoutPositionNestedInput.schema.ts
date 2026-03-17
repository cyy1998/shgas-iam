import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateWithoutPositionInputObjectSchema as PosOrgCompositionCreateWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateWithoutPositionInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutPositionInput.schema';
import { PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema as PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateOrConnectWithoutPositionInput.schema';
import { PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInputObjectSchema as PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInputObjectSchema } from './PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInput.schema';
import { PosOrgCompositionCreateManyPositionInputEnvelopeObjectSchema as PosOrgCompositionCreateManyPositionInputEnvelopeObjectSchema } from './PosOrgCompositionCreateManyPositionInputEnvelope.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInputObjectSchema as PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInputObjectSchema } from './PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInput.schema';
import { PosOrgCompositionUpdateManyWithWhereWithoutPositionInputObjectSchema as PosOrgCompositionUpdateManyWithWhereWithoutPositionInputObjectSchema } from './PosOrgCompositionUpdateManyWithWhereWithoutPositionInput.schema';
import { PosOrgCompositionScalarWhereInputObjectSchema as PosOrgCompositionScalarWhereInputObjectSchema } from './PosOrgCompositionScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionCreateWithoutPositionInputObjectSchema).array(), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUpsertWithWhereUniqueWithoutPositionInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PosOrgCompositionCreateManyPositionInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUpdateWithWhereUniqueWithoutPositionInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PosOrgCompositionUpdateManyWithWhereWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUpdateManyWithWhereWithoutPositionInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PosOrgCompositionScalarWhereInputObjectSchema), z.lazy(() => PosOrgCompositionScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PosOrgCompositionUpdateManyWithoutPositionNestedInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateManyWithoutPositionNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateManyWithoutPositionNestedInput>;
export const PosOrgCompositionUpdateManyWithoutPositionNestedInputObjectZodSchema = makeSchema();
