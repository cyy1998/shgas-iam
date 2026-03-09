import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleUpdateWithoutClientInputObjectSchema as RoleUpdateWithoutClientInputObjectSchema } from './RoleUpdateWithoutClientInput.schema';
import { RoleUncheckedUpdateWithoutClientInputObjectSchema as RoleUncheckedUpdateWithoutClientInputObjectSchema } from './RoleUncheckedUpdateWithoutClientInput.schema';
import { RoleCreateWithoutClientInputObjectSchema as RoleCreateWithoutClientInputObjectSchema } from './RoleCreateWithoutClientInput.schema';
import { RoleUncheckedCreateWithoutClientInputObjectSchema as RoleUncheckedCreateWithoutClientInputObjectSchema } from './RoleUncheckedCreateWithoutClientInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => RoleUpdateWithoutClientInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutClientInputObjectSchema)]),
  create: z.union([z.lazy(() => RoleCreateWithoutClientInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutClientInputObjectSchema)])
}).strict();
export const RoleUpsertWithWhereUniqueWithoutClientInputObjectSchema: z.ZodType<Prisma.RoleUpsertWithWhereUniqueWithoutClientInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpsertWithWhereUniqueWithoutClientInput>;
export const RoleUpsertWithWhereUniqueWithoutClientInputObjectZodSchema = makeSchema();
