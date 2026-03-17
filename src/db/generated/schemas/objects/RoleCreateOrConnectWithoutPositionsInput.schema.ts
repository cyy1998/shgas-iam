import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleCreateWithoutPositionsInputObjectSchema as RoleCreateWithoutPositionsInputObjectSchema } from './RoleCreateWithoutPositionsInput.schema';
import { RoleUncheckedCreateWithoutPositionsInputObjectSchema as RoleUncheckedCreateWithoutPositionsInputObjectSchema } from './RoleUncheckedCreateWithoutPositionsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => RoleCreateWithoutPositionsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPositionsInputObjectSchema)])
}).strict();
export const RoleCreateOrConnectWithoutPositionsInputObjectSchema: z.ZodType<Prisma.RoleCreateOrConnectWithoutPositionsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateOrConnectWithoutPositionsInput>;
export const RoleCreateOrConnectWithoutPositionsInputObjectZodSchema = makeSchema();
