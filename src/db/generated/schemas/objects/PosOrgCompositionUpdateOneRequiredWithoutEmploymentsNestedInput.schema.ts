import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema as PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionCreateWithoutEmploymentsInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutEmploymentsInput.schema';
import { PosOrgCompositionCreateOrConnectWithoutEmploymentsInputObjectSchema as PosOrgCompositionCreateOrConnectWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionCreateOrConnectWithoutEmploymentsInput.schema';
import { PosOrgCompositionUpsertWithoutEmploymentsInputObjectSchema as PosOrgCompositionUpsertWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUpsertWithoutEmploymentsInput.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema as PosOrgCompositionUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUpdateToOneWithWhereWithoutEmploymentsInput.schema';
import { PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUpdateWithoutEmploymentsInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PosOrgCompositionCreateOrConnectWithoutEmploymentsInputObjectSchema).optional(),
  upsert: z.lazy(() => PosOrgCompositionUpsertWithoutEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => PosOrgCompositionUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema), z.lazy(() => PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema)]).optional()
}).strict();
export const PosOrgCompositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateOneRequiredWithoutEmploymentsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateOneRequiredWithoutEmploymentsNestedInput>;
export const PosOrgCompositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectZodSchema = makeSchema();
