import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema';
import { RoleUpdateWithoutEmploymentsInputObjectSchema as RoleUpdateWithoutEmploymentsInputObjectSchema } from './RoleUpdateWithoutEmploymentsInput.schema';
import { RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema as RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './RoleUncheckedUpdateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => RoleUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema)])
}).strict();
export const RoleUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutEmploymentsInput>;
export const RoleUpdateToOneWithWhereWithoutEmploymentsInputObjectZodSchema = makeSchema();
