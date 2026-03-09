import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionUpdateWithoutEmploymentsInputObjectSchema as PositionUpdateWithoutEmploymentsInputObjectSchema } from './PositionUpdateWithoutEmploymentsInput.schema';
import { PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema as PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './PositionUncheckedUpdateWithoutEmploymentsInput.schema';
import { PositionCreateWithoutEmploymentsInputObjectSchema as PositionCreateWithoutEmploymentsInputObjectSchema } from './PositionCreateWithoutEmploymentsInput.schema';
import { PositionUncheckedCreateWithoutEmploymentsInputObjectSchema as PositionUncheckedCreateWithoutEmploymentsInputObjectSchema } from './PositionUncheckedCreateWithoutEmploymentsInput.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => PositionUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema)]),
  create: z.union([z.lazy(() => PositionCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutEmploymentsInputObjectSchema)]),
  where: z.lazy(() => PositionWhereInputObjectSchema).optional()
}).strict();
export const PositionUpsertWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.PositionUpsertWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpsertWithoutEmploymentsInput>;
export const PositionUpsertWithoutEmploymentsInputObjectZodSchema = makeSchema();
