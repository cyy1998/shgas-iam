import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeCreateWithoutRoleInputObjectSchema as RolePrivilegeCreateWithoutRoleInputObjectSchema } from './RolePrivilegeCreateWithoutRoleInput.schema';
import { RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema as RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => RolePrivilegeCreateWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateOrConnectWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateOrConnectWithoutRoleInput>;
export const RolePrivilegeCreateOrConnectWithoutRoleInputObjectZodSchema = makeSchema();
