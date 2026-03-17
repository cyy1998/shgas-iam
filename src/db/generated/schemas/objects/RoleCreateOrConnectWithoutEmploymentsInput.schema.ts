import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleCreateWithoutEmploymentsInputObjectSchema as RoleCreateWithoutEmploymentsInputObjectSchema } from './RoleCreateWithoutEmploymentsInput.schema';
import { RoleUncheckedCreateWithoutEmploymentsInputObjectSchema as RoleUncheckedCreateWithoutEmploymentsInputObjectSchema } from './RoleUncheckedCreateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => RoleCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutEmploymentsInputObjectSchema)])
}).strict();
export const RoleCreateOrConnectWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.RoleCreateOrConnectWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateOrConnectWithoutEmploymentsInput>;
export const RoleCreateOrConnectWithoutEmploymentsInputObjectZodSchema = makeSchema();
