import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailCreateWithoutDelegationInputObjectSchema as DelegationDetailCreateWithoutDelegationInputObjectSchema } from './DelegationDetailCreateWithoutDelegationInput.schema';
import { DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema as DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema } from './DelegationDetailUncheckedCreateWithoutDelegationInput.schema';
import { DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema as DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema } from './DelegationDetailCreateOrConnectWithoutDelegationInput.schema';
import { DelegationDetailUpsertWithWhereUniqueWithoutDelegationInputObjectSchema as DelegationDetailUpsertWithWhereUniqueWithoutDelegationInputObjectSchema } from './DelegationDetailUpsertWithWhereUniqueWithoutDelegationInput.schema';
import { DelegationDetailCreateManyDelegationInputEnvelopeObjectSchema as DelegationDetailCreateManyDelegationInputEnvelopeObjectSchema } from './DelegationDetailCreateManyDelegationInputEnvelope.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailUpdateWithWhereUniqueWithoutDelegationInputObjectSchema as DelegationDetailUpdateWithWhereUniqueWithoutDelegationInputObjectSchema } from './DelegationDetailUpdateWithWhereUniqueWithoutDelegationInput.schema';
import { DelegationDetailUpdateManyWithWhereWithoutDelegationInputObjectSchema as DelegationDetailUpdateManyWithWhereWithoutDelegationInputObjectSchema } from './DelegationDetailUpdateManyWithWhereWithoutDelegationInput.schema';
import { DelegationDetailScalarWhereInputObjectSchema as DelegationDetailScalarWhereInputObjectSchema } from './DelegationDetailScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => DelegationDetailCreateWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailCreateWithoutDelegationInputObjectSchema).array(), z.lazy(() => DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUncheckedCreateWithoutDelegationInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailCreateOrConnectWithoutDelegationInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => DelegationDetailUpsertWithWhereUniqueWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUpsertWithWhereUniqueWithoutDelegationInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => DelegationDetailCreateManyDelegationInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => DelegationDetailUpdateWithWhereUniqueWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUpdateWithWhereUniqueWithoutDelegationInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => DelegationDetailUpdateManyWithWhereWithoutDelegationInputObjectSchema), z.lazy(() => DelegationDetailUpdateManyWithWhereWithoutDelegationInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => DelegationDetailScalarWhereInputObjectSchema), z.lazy(() => DelegationDetailScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const DelegationDetailUpdateManyWithoutDelegationNestedInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateManyWithoutDelegationNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateManyWithoutDelegationNestedInput>;
export const DelegationDetailUpdateManyWithoutDelegationNestedInputObjectZodSchema = makeSchema();
