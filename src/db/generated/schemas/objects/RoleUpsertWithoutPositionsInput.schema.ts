import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateWithoutPositionsInputObjectSchema as RoleUpdateWithoutPositionsInputObjectSchema } from './RoleUpdateWithoutPositionsInput.schema';
import { RoleUncheckedUpdateWithoutPositionsInputObjectSchema as RoleUncheckedUpdateWithoutPositionsInputObjectSchema } from './RoleUncheckedUpdateWithoutPositionsInput.schema';
import { RoleCreateWithoutPositionsInputObjectSchema as RoleCreateWithoutPositionsInputObjectSchema } from './RoleCreateWithoutPositionsInput.schema';
import { RoleUncheckedCreateWithoutPositionsInputObjectSchema as RoleUncheckedCreateWithoutPositionsInputObjectSchema } from './RoleUncheckedCreateWithoutPositionsInput.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => RoleUpdateWithoutPositionsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPositionsInputObjectSchema)]),
  create: z.union([z.lazy(() => RoleCreateWithoutPositionsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPositionsInputObjectSchema)]),
  where: z.lazy(() => RoleWhereInputObjectSchema).optional()
}).strict();
export const RoleUpsertWithoutPositionsInputObjectSchema: z.ZodType<Prisma.RoleUpsertWithoutPositionsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpsertWithoutPositionsInput>;
export const RoleUpsertWithoutPositionsInputObjectZodSchema = makeSchema();
