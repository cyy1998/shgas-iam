import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema as PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionCreateWithoutEmploymentsInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutEmploymentsInput.schema';
import { PosOrgCompositionCreateOrConnectWithoutEmploymentsInputObjectSchema as PosOrgCompositionCreateOrConnectWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionCreateOrConnectWithoutEmploymentsInput.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PosOrgCompositionCreateOrConnectWithoutEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionCreateNestedOneWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateNestedOneWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateNestedOneWithoutEmploymentsInput>;
export const PosOrgCompositionCreateNestedOneWithoutEmploymentsInputObjectZodSchema = makeSchema();
