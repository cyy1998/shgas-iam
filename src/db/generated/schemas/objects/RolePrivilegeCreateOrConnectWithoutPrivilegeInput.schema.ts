import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeCreateWithoutPrivilegeInputObjectSchema as RolePrivilegeCreateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeCreateWithoutPrivilegeInput.schema';
import { RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema as RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUncheckedCreateWithoutPrivilegeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => RolePrivilegeCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema)])
}).strict();
export const RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateOrConnectWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateOrConnectWithoutPrivilegeInput>;
export const RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectZodSchema = makeSchema();
