import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleCreateWithoutClientInputObjectSchema as RoleCreateWithoutClientInputObjectSchema } from './RoleCreateWithoutClientInput.schema';
import { RoleUncheckedCreateWithoutClientInputObjectSchema as RoleUncheckedCreateWithoutClientInputObjectSchema } from './RoleUncheckedCreateWithoutClientInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => RoleCreateWithoutClientInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutClientInputObjectSchema)])
}).strict();
export const RoleCreateOrConnectWithoutClientInputObjectSchema: z.ZodType<Prisma.RoleCreateOrConnectWithoutClientInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateOrConnectWithoutClientInput>;
export const RoleCreateOrConnectWithoutClientInputObjectZodSchema = makeSchema();
