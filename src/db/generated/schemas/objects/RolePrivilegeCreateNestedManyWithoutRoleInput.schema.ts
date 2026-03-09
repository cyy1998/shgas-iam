import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeCreateWithoutRoleInputObjectSchema as RolePrivilegeCreateWithoutRoleInputObjectSchema } from './RolePrivilegeCreateWithoutRoleInput.schema';
import { RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema as RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedCreateWithoutRoleInput.schema';
import { RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema as RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema } from './RolePrivilegeCreateOrConnectWithoutRoleInput.schema';
import { RolePrivilegeCreateManyRoleInputEnvelopeObjectSchema as RolePrivilegeCreateManyRoleInputEnvelopeObjectSchema } from './RolePrivilegeCreateManyRoleInputEnvelope.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RolePrivilegeCreateWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => RolePrivilegeCreateManyRoleInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const RolePrivilegeCreateNestedManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateNestedManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateNestedManyWithoutRoleInput>;
export const RolePrivilegeCreateNestedManyWithoutRoleInputObjectZodSchema = makeSchema();
