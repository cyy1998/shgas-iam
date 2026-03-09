import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionCreateWithoutPosOrgCompositionInputObjectSchema as PositionCreateWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateWithoutPosOrgCompositionInput.schema';
import { PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema as PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema } from './PositionUncheckedCreateWithoutPosOrgCompositionInput.schema';
import { PositionCreateOrConnectWithoutPosOrgCompositionInputObjectSchema as PositionCreateOrConnectWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateOrConnectWithoutPosOrgCompositionInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionCreateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PositionCreateOrConnectWithoutPosOrgCompositionInputObjectSchema).optional(),
  connect: z.lazy(() => PositionWhereUniqueInputObjectSchema).optional()
}).strict();
export const PositionCreateNestedOneWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.PositionCreateNestedOneWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateNestedOneWithoutPosOrgCompositionInput>;
export const PositionCreateNestedOneWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
