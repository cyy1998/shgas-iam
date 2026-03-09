import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeUpdateWithoutRoleInputObjectSchema as RolePrivilegeUpdateWithoutRoleInputObjectSchema } from './RolePrivilegeUpdateWithoutRoleInput.schema';
import { RolePrivilegeUncheckedUpdateWithoutRoleInputObjectSchema as RolePrivilegeUncheckedUpdateWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedUpdateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => RolePrivilegeUpdateWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedUpdateWithoutRoleInputObjectSchema)])
}).strict();
export const RolePrivilegeUpdateWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateWithWhereUniqueWithoutRoleInput>;
export const RolePrivilegeUpdateWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
