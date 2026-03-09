import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionCreateWithoutPosOrgCompositionInputObjectSchema as PositionCreateWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateWithoutPosOrgCompositionInput.schema';
import { PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema as PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema } from './PositionUncheckedCreateWithoutPosOrgCompositionInput.schema';
import { PositionCreateOrConnectWithoutPosOrgCompositionInputObjectSchema as PositionCreateOrConnectWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateOrConnectWithoutPosOrgCompositionInput.schema';
import { PositionUpsertWithoutPosOrgCompositionInputObjectSchema as PositionUpsertWithoutPosOrgCompositionInputObjectSchema } from './PositionUpsertWithoutPosOrgCompositionInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema';
import { PositionUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectSchema as PositionUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectSchema } from './PositionUpdateToOneWithWhereWithoutPosOrgCompositionInput.schema';
import { PositionUpdateWithoutPosOrgCompositionInputObjectSchema as PositionUpdateWithoutPosOrgCompositionInputObjectSchema } from './PositionUpdateWithoutPosOrgCompositionInput.schema';
import { PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema as PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema } from './PositionUncheckedUpdateWithoutPosOrgCompositionInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionCreateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PositionCreateOrConnectWithoutPosOrgCompositionInputObjectSchema).optional(),
  upsert: z.lazy(() => PositionUpsertWithoutPosOrgCompositionInputObjectSchema).optional(),
  connect: z.lazy(() => PositionWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => PositionUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => PositionUpdateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema)]).optional()
}).strict();
export const PositionUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectSchema: z.ZodType<Prisma.PositionUpdateOneRequiredWithoutPosOrgCompositionNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpdateOneRequiredWithoutPosOrgCompositionNestedInput>;
export const PositionUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectZodSchema = makeSchema();
