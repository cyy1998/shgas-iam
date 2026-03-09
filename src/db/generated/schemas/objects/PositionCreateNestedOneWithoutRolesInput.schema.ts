import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionCreateWithoutRolesInputObjectSchema as PositionCreateWithoutRolesInputObjectSchema } from './PositionCreateWithoutRolesInput.schema';
import { PositionUncheckedCreateWithoutRolesInputObjectSchema as PositionUncheckedCreateWithoutRolesInputObjectSchema } from './PositionUncheckedCreateWithoutRolesInput.schema';
import { PositionCreateOrConnectWithoutRolesInputObjectSchema as PositionCreateOrConnectWithoutRolesInputObjectSchema } from './PositionCreateOrConnectWithoutRolesInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionCreateWithoutRolesInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PositionCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => PositionWhereUniqueInputObjectSchema).optional()
}).strict();
export const PositionCreateNestedOneWithoutRolesInputObjectSchema: z.ZodType<Prisma.PositionCreateNestedOneWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionCreateNestedOneWithoutRolesInput>;
export const PositionCreateNestedOneWithoutRolesInputObjectZodSchema = makeSchema();
