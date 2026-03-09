import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './PrivilegeWhereInput.schema';
import { PrivilegeUpdateWithoutRolesInputObjectSchema as PrivilegeUpdateWithoutRolesInputObjectSchema } from './PrivilegeUpdateWithoutRolesInput.schema';
import { PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema as PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema } from './PrivilegeUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => PrivilegeUpdateWithoutRolesInputObjectSchema), z.lazy(() => PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema)])
}).strict();
export const PrivilegeUpdateToOneWithWhereWithoutRolesInputObjectSchema: z.ZodType<Prisma.PrivilegeUpdateToOneWithWhereWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeUpdateToOneWithWhereWithoutRolesInput>;
export const PrivilegeUpdateToOneWithWhereWithoutRolesInputObjectZodSchema = makeSchema();
