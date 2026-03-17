import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema';
import { PositionRoleUpdateWithoutPositionInputObjectSchema as PositionRoleUpdateWithoutPositionInputObjectSchema } from './PositionRoleUpdateWithoutPositionInput.schema';
import { PositionRoleUncheckedUpdateWithoutPositionInputObjectSchema as PositionRoleUncheckedUpdateWithoutPositionInputObjectSchema } from './PositionRoleUncheckedUpdateWithoutPositionInput.schema';
import { PositionRoleCreateWithoutPositionInputObjectSchema as PositionRoleCreateWithoutPositionInputObjectSchema } from './PositionRoleCreateWithoutPositionInput.schema';
import { PositionRoleUncheckedCreateWithoutPositionInputObjectSchema as PositionRoleUncheckedCreateWithoutPositionInputObjectSchema } from './PositionRoleUncheckedCreateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PositionRoleUpdateWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUncheckedUpdateWithoutPositionInputObjectSchema)]),
  create: z.union([z.lazy(() => PositionRoleCreateWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUncheckedCreateWithoutPositionInputObjectSchema)])
}).strict();
export const PositionRoleUpsertWithWhereUniqueWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleUpsertWithWhereUniqueWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpsertWithWhereUniqueWithoutPositionInput>;
export const PositionRoleUpsertWithWhereUniqueWithoutPositionInputObjectZodSchema = makeSchema();
