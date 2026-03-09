import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema';
import { PositionRoleCreateWithoutRoleInputObjectSchema as PositionRoleCreateWithoutRoleInputObjectSchema } from './PositionRoleCreateWithoutRoleInput.schema';
import { PositionRoleUncheckedCreateWithoutRoleInputObjectSchema as PositionRoleUncheckedCreateWithoutRoleInputObjectSchema } from './PositionRoleUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PositionRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const PositionRoleCreateOrConnectWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleCreateOrConnectWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateOrConnectWithoutRoleInput>;
export const PositionRoleCreateOrConnectWithoutRoleInputObjectZodSchema = makeSchema();
