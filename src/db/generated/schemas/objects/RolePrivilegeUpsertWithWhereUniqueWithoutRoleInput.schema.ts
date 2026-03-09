import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeUpdateWithoutRoleInputObjectSchema as RolePrivilegeUpdateWithoutRoleInputObjectSchema } from './RolePrivilegeUpdateWithoutRoleInput.schema';
import { RolePrivilegeUncheckedUpdateWithoutRoleInputObjectSchema as RolePrivilegeUncheckedUpdateWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedUpdateWithoutRoleInput.schema';
import { RolePrivilegeCreateWithoutRoleInputObjectSchema as RolePrivilegeCreateWithoutRoleInputObjectSchema } from './RolePrivilegeCreateWithoutRoleInput.schema';
import { RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema as RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => RolePrivilegeUpdateWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedUpdateWithoutRoleInputObjectSchema)]),
  create: z.union([z.lazy(() => RolePrivilegeCreateWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const RolePrivilegeUpsertWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpsertWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpsertWithWhereUniqueWithoutRoleInput>;
export const RolePrivilegeUpsertWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
