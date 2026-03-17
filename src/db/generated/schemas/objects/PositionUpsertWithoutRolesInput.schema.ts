import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionUpdateWithoutRolesInputObjectSchema as PositionUpdateWithoutRolesInputObjectSchema } from './PositionUpdateWithoutRolesInput.schema';
import { PositionUncheckedUpdateWithoutRolesInputObjectSchema as PositionUncheckedUpdateWithoutRolesInputObjectSchema } from './PositionUncheckedUpdateWithoutRolesInput.schema';
import { PositionCreateWithoutRolesInputObjectSchema as PositionCreateWithoutRolesInputObjectSchema } from './PositionCreateWithoutRolesInput.schema';
import { PositionUncheckedCreateWithoutRolesInputObjectSchema as PositionUncheckedCreateWithoutRolesInputObjectSchema } from './PositionUncheckedCreateWithoutRolesInput.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => PositionUpdateWithoutRolesInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutRolesInputObjectSchema)]),
  create: z.union([z.lazy(() => PositionCreateWithoutRolesInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutRolesInputObjectSchema)]),
  where: z.lazy(() => PositionWhereInputObjectSchema).optional()
}).strict();
export const PositionUpsertWithoutRolesInputObjectSchema: z.ZodType<Prisma.PositionUpsertWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpsertWithoutRolesInput>;
export const PositionUpsertWithoutRolesInputObjectZodSchema = makeSchema();
