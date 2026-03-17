import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutEmploymentsInputObjectSchema as RoleCreateWithoutEmploymentsInputObjectSchema } from './RoleCreateWithoutEmploymentsInput.schema';
import { RoleUncheckedCreateWithoutEmploymentsInputObjectSchema as RoleUncheckedCreateWithoutEmploymentsInputObjectSchema } from './RoleUncheckedCreateWithoutEmploymentsInput.schema';
import { RoleCreateOrConnectWithoutEmploymentsInputObjectSchema as RoleCreateOrConnectWithoutEmploymentsInputObjectSchema } from './RoleCreateOrConnectWithoutEmploymentsInput.schema';
import { RoleUpsertWithoutEmploymentsInputObjectSchema as RoleUpsertWithoutEmploymentsInputObjectSchema } from './RoleUpsertWithoutEmploymentsInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema as RoleUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema } from './RoleUpdateToOneWithWhereWithoutEmploymentsInput.schema';
import { RoleUpdateWithoutEmploymentsInputObjectSchema as RoleUpdateWithoutEmploymentsInputObjectSchema } from './RoleUpdateWithoutEmploymentsInput.schema';
import { RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema as RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './RoleUncheckedUpdateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutEmploymentsInputObjectSchema).optional(),
  upsert: z.lazy(() => RoleUpsertWithoutEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => RoleUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema), z.lazy(() => RoleUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutEmploymentsInputObjectSchema)]).optional()
}).strict();
export const RoleUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema: z.ZodType<Prisma.RoleUpdateOneRequiredWithoutEmploymentsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateOneRequiredWithoutEmploymentsNestedInput>;
export const RoleUpdateOneRequiredWithoutEmploymentsNestedInputObjectZodSchema = makeSchema();
