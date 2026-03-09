import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionCreateWithoutEmploymentsInputObjectSchema as PositionCreateWithoutEmploymentsInputObjectSchema } from './PositionCreateWithoutEmploymentsInput.schema';
import { PositionUncheckedCreateWithoutEmploymentsInputObjectSchema as PositionUncheckedCreateWithoutEmploymentsInputObjectSchema } from './PositionUncheckedCreateWithoutEmploymentsInput.schema';
import { PositionCreateOrConnectWithoutEmploymentsInputObjectSchema as PositionCreateOrConnectWithoutEmploymentsInputObjectSchema } from './PositionCreateOrConnectWithoutEmploymentsInput.schema';
import { PositionUpsertWithoutEmploymentsInputObjectSchema as PositionUpsertWithoutEmploymentsInputObjectSchema } from './PositionUpsertWithoutEmploymentsInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema';
import { PositionUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema as PositionUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema } from './PositionUpdateToOneWithWhereWithoutEmploymentsInput.schema';
import { PositionUpdateWithoutEmploymentsInputObjectSchema as PositionUpdateWithoutEmploymentsInputObjectSchema } from './PositionUpdateWithoutEmploymentsInput.schema';
import { PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema as PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './PositionUncheckedUpdateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PositionCreateOrConnectWithoutEmploymentsInputObjectSchema).optional(),
  upsert: z.lazy(() => PositionUpsertWithoutEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => PositionWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => PositionUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema), z.lazy(() => PositionUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutEmploymentsInputObjectSchema)]).optional()
}).strict();
export const PositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema: z.ZodType<Prisma.PositionUpdateOneRequiredWithoutEmploymentsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpdateOneRequiredWithoutEmploymentsNestedInput>;
export const PositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectZodSchema = makeSchema();
