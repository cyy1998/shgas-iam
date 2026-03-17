import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateWithoutPositionInputObjectSchema as PosOrgCompositionCreateWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateWithoutPositionInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutPositionInput.schema';
import { PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema as PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema } from './PosOrgCompositionCreateOrConnectWithoutPositionInput.schema';
import { PosOrgCompositionCreateManyPositionInputEnvelopeObjectSchema as PosOrgCompositionCreateManyPositionInputEnvelopeObjectSchema } from './PosOrgCompositionCreateManyPositionInputEnvelope.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionCreateWithoutPositionInputObjectSchema).array(), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutPositionInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema), z.lazy(() => PosOrgCompositionCreateOrConnectWithoutPositionInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PosOrgCompositionCreateManyPositionInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema), z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInput>;
export const PosOrgCompositionUncheckedCreateNestedManyWithoutPositionInputObjectZodSchema = makeSchema();
