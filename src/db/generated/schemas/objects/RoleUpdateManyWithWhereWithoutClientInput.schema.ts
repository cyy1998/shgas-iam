import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleScalarWhereInputObjectSchema as RoleScalarWhereInputObjectSchema } from './RoleScalarWhereInput.schema';
import { RoleUpdateManyMutationInputObjectSchema as RoleUpdateManyMutationInputObjectSchema } from './RoleUpdateManyMutationInput.schema';
import { RoleUncheckedUpdateManyWithoutClientInputObjectSchema as RoleUncheckedUpdateManyWithoutClientInputObjectSchema } from './RoleUncheckedUpdateManyWithoutClientInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => RoleUpdateManyMutationInputObjectSchema), z.lazy(() => RoleUncheckedUpdateManyWithoutClientInputObjectSchema)])
}).strict();
export const RoleUpdateManyWithWhereWithoutClientInputObjectSchema: z.ZodType<Prisma.RoleUpdateManyWithWhereWithoutClientInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateManyWithWhereWithoutClientInput>;
export const RoleUpdateManyWithWhereWithoutClientInputObjectZodSchema = makeSchema();
