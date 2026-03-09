import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './PrivilegeWhereInput.schema';
import { PrivilegeUpdateWithoutDelegationsInputObjectSchema as PrivilegeUpdateWithoutDelegationsInputObjectSchema } from './PrivilegeUpdateWithoutDelegationsInput.schema';
import { PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema as PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema } from './PrivilegeUncheckedUpdateWithoutDelegationsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => PrivilegeUpdateWithoutDelegationsInputObjectSchema), z.lazy(() => PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema)])
}).strict();
export const PrivilegeUpdateToOneWithWhereWithoutDelegationsInputObjectSchema: z.ZodType<Prisma.PrivilegeUpdateToOneWithWhereWithoutDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeUpdateToOneWithWhereWithoutDelegationsInput>;
export const PrivilegeUpdateToOneWithWhereWithoutDelegationsInputObjectZodSchema = makeSchema();
