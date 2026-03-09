import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema';
import { PositionRoleUpdateWithoutRoleInputObjectSchema as PositionRoleUpdateWithoutRoleInputObjectSchema } from './PositionRoleUpdateWithoutRoleInput.schema';
import { PositionRoleUncheckedUpdateWithoutRoleInputObjectSchema as PositionRoleUncheckedUpdateWithoutRoleInputObjectSchema } from './PositionRoleUncheckedUpdateWithoutRoleInput.schema';
import { PositionRoleCreateWithoutRoleInputObjectSchema as PositionRoleCreateWithoutRoleInputObjectSchema } from './PositionRoleCreateWithoutRoleInput.schema';
import { PositionRoleUncheckedCreateWithoutRoleInputObjectSchema as PositionRoleUncheckedCreateWithoutRoleInputObjectSchema } from './PositionRoleUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PositionRoleUpdateWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUncheckedUpdateWithoutRoleInputObjectSchema)]),
  create: z.union([z.lazy(() => PositionRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const PositionRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleUpsertWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpsertWithWhereUniqueWithoutRoleInput>;
export const PositionRoleUpsertWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
