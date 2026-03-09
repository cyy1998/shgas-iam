import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutEmploymentsInputObjectSchema as RoleCreateWithoutEmploymentsInputObjectSchema } from './RoleCreateWithoutEmploymentsInput.schema';
import { RoleUncheckedCreateWithoutEmploymentsInputObjectSchema as RoleUncheckedCreateWithoutEmploymentsInputObjectSchema } from './RoleUncheckedCreateWithoutEmploymentsInput.schema';
import { RoleCreateOrConnectWithoutEmploymentsInputObjectSchema as RoleCreateOrConnectWithoutEmploymentsInputObjectSchema } from './RoleCreateOrConnectWithoutEmploymentsInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional()
}).strict();
export const RoleCreateNestedOneWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.RoleCreateNestedOneWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateNestedOneWithoutEmploymentsInput>;
export const RoleCreateNestedOneWithoutEmploymentsInputObjectZodSchema = makeSchema();
