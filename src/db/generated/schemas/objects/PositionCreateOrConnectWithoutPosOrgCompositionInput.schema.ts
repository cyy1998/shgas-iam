import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema';
import { PositionCreateWithoutPosOrgCompositionInputObjectSchema as PositionCreateWithoutPosOrgCompositionInputObjectSchema } from './PositionCreateWithoutPosOrgCompositionInput.schema';
import { PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema as PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema } from './PositionUncheckedCreateWithoutPosOrgCompositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PositionCreateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutPosOrgCompositionInputObjectSchema)])
}).strict();
export const PositionCreateOrConnectWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.PositionCreateOrConnectWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateOrConnectWithoutPosOrgCompositionInput>;
export const PositionCreateOrConnectWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
