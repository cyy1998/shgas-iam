import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema';
import { PositionUpdateWithoutRolesInputObjectSchema as PositionUpdateWithoutRolesInputObjectSchema } from './PositionUpdateWithoutRolesInput.schema';
import { PositionUncheckedUpdateWithoutRolesInputObjectSchema as PositionUncheckedUpdateWithoutRolesInputObjectSchema } from './PositionUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => PositionUpdateWithoutRolesInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutRolesInputObjectSchema)])
}).strict();
export const PositionUpdateToOneWithWhereWithoutRolesInputObjectSchema: z.ZodType<Prisma.PositionUpdateToOneWithWhereWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpdateToOneWithWhereWithoutRolesInput>;
export const PositionUpdateToOneWithWhereWithoutRolesInputObjectZodSchema = makeSchema();
