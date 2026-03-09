import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUpdateWithoutEmploymentsInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutEmploymentsInput.schema';
import { PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema as PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionCreateWithoutEmploymentsInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutEmploymentsInput.schema';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => PosOrgCompositionUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutEmploymentsInputObjectSchema)]),
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutEmploymentsInputObjectSchema)]),
  where: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionUpsertWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpsertWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpsertWithoutEmploymentsInput>;
export const PosOrgCompositionUpsertWithoutEmploymentsInputObjectZodSchema = makeSchema();
