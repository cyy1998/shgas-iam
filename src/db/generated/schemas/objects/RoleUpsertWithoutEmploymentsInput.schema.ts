import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateWithoutEmploymentsInputObjectSchema as RoleUpdateWithoutEmploymentsInputObjectSchema } from './RoleUpdateWithoutEmploymentsInput.schema';
import { RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema as RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './RoleUncheckedUpdateWithoutEmploymentsInput.schema';
import { RoleCreateWithoutEmploymentsInputObjectSchema as RoleCreateWithoutEmploymentsInputObjectSchema } from './RoleCreateWithoutEmploymentsInput.schema';
import { RoleUncheckedCreateWithoutEmploymentsInputObjectSchema as RoleUncheckedCreateWithoutEmploymentsInputObjectSchema } from './RoleUncheckedCreateWithoutEmploymentsInput.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => RoleUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema)]),
  create: z.union([z.lazy(() => RoleCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutEmploymentsInputObjectSchema)]),
  where: z.lazy(() => RoleWhereInputObjectSchema).optional()
}).strict();
export const RoleUpsertWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.RoleUpsertWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpsertWithoutEmploymentsInput>;
export const RoleUpsertWithoutEmploymentsInputObjectZodSchema = makeSchema();
