import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema';
import { PositionRoleUpdateWithoutPositionInputObjectSchema as PositionRoleUpdateWithoutPositionInputObjectSchema } from './PositionRoleUpdateWithoutPositionInput.schema';
import { PositionRoleUncheckedUpdateWithoutPositionInputObjectSchema as PositionRoleUncheckedUpdateWithoutPositionInputObjectSchema } from './PositionRoleUncheckedUpdateWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PositionRoleUpdateWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUncheckedUpdateWithoutPositionInputObjectSchema)])
}).strict();
export const PositionRoleUpdateWithWhereUniqueWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateWithWhereUniqueWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateWithWhereUniqueWithoutPositionInput>;
export const PositionRoleUpdateWithWhereUniqueWithoutPositionInputObjectZodSchema = makeSchema();
