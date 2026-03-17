import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleUpdateWithoutClientInputObjectSchema as RoleUpdateWithoutClientInputObjectSchema } from './RoleUpdateWithoutClientInput.schema';
import { RoleUncheckedUpdateWithoutClientInputObjectSchema as RoleUncheckedUpdateWithoutClientInputObjectSchema } from './RoleUncheckedUpdateWithoutClientInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => RoleUpdateWithoutClientInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutClientInputObjectSchema)])
}).strict();
export const RoleUpdateWithWhereUniqueWithoutClientInputObjectSchema: z.ZodType<Prisma.RoleUpdateWithWhereUniqueWithoutClientInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateWithWhereUniqueWithoutClientInput>;
export const RoleUpdateWithWhereUniqueWithoutClientInputObjectZodSchema = makeSchema();
