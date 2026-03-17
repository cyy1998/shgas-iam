import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema';
import { RoleUpdateWithoutPositionsInputObjectSchema as RoleUpdateWithoutPositionsInputObjectSchema } from './RoleUpdateWithoutPositionsInput.schema';
import { RoleUncheckedUpdateWithoutPositionsInputObjectSchema as RoleUncheckedUpdateWithoutPositionsInputObjectSchema } from './RoleUncheckedUpdateWithoutPositionsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => RoleUpdateWithoutPositionsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPositionsInputObjectSchema)])
}).strict();
export const RoleUpdateToOneWithWhereWithoutPositionsInputObjectSchema: z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutPositionsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutPositionsInput>;
export const RoleUpdateToOneWithWhereWithoutPositionsInputObjectZodSchema = makeSchema();
