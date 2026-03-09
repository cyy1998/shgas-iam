import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema';
import { PositionRoleCreateWithoutPositionInputObjectSchema as PositionRoleCreateWithoutPositionInputObjectSchema } from './PositionRoleCreateWithoutPositionInput.schema';
import { PositionRoleUncheckedCreateWithoutPositionInputObjectSchema as PositionRoleUncheckedCreateWithoutPositionInputObjectSchema } from './PositionRoleUncheckedCreateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PositionRoleCreateWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUncheckedCreateWithoutPositionInputObjectSchema)])
}).strict();
export const PositionRoleCreateOrConnectWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleCreateOrConnectWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateOrConnectWithoutPositionInput>;
export const PositionRoleCreateOrConnectWithoutPositionInputObjectZodSchema = makeSchema();
