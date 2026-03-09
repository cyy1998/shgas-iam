import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema';
import { PositionCreateWithoutRolesInputObjectSchema as PositionCreateWithoutRolesInputObjectSchema } from './PositionCreateWithoutRolesInput.schema';
import { PositionUncheckedCreateWithoutRolesInputObjectSchema as PositionUncheckedCreateWithoutRolesInputObjectSchema } from './PositionUncheckedCreateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PositionCreateWithoutRolesInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutRolesInputObjectSchema)])
}).strict();
export const PositionCreateOrConnectWithoutRolesInputObjectSchema: z.ZodType<Prisma.PositionCreateOrConnectWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateOrConnectWithoutRolesInput>;
export const PositionCreateOrConnectWithoutRolesInputObjectZodSchema = makeSchema();
