import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutPositionsInputObjectSchema as RoleCreateWithoutPositionsInputObjectSchema } from './RoleCreateWithoutPositionsInput.schema';
import { RoleUncheckedCreateWithoutPositionsInputObjectSchema as RoleUncheckedCreateWithoutPositionsInputObjectSchema } from './RoleUncheckedCreateWithoutPositionsInput.schema';
import { RoleCreateOrConnectWithoutPositionsInputObjectSchema as RoleCreateOrConnectWithoutPositionsInputObjectSchema } from './RoleCreateOrConnectWithoutPositionsInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutPositionsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPositionsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutPositionsInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional()
}).strict();
export const RoleCreateNestedOneWithoutPositionsInputObjectSchema: z.ZodType<Prisma.RoleCreateNestedOneWithoutPositionsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateNestedOneWithoutPositionsInput>;
export const RoleCreateNestedOneWithoutPositionsInputObjectZodSchema = makeSchema();
