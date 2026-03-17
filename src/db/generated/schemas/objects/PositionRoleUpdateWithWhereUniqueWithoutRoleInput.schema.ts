import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema';
import { PositionRoleUpdateWithoutRoleInputObjectSchema as PositionRoleUpdateWithoutRoleInputObjectSchema } from './PositionRoleUpdateWithoutRoleInput.schema';
import { PositionRoleUncheckedUpdateWithoutRoleInputObjectSchema as PositionRoleUncheckedUpdateWithoutRoleInputObjectSchema } from './PositionRoleUncheckedUpdateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PositionRoleUpdateWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUncheckedUpdateWithoutRoleInputObjectSchema)])
}).strict();
export const PositionRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateWithWhereUniqueWithoutRoleInput>;
export const PositionRoleUpdateWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
