import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeUpdateWithoutPrivilegeInputObjectSchema as RolePrivilegeUpdateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUpdateWithoutPrivilegeInput.schema';
import { RolePrivilegeUncheckedUpdateWithoutPrivilegeInputObjectSchema as RolePrivilegeUncheckedUpdateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUncheckedUpdateWithoutPrivilegeInput.schema';
import { RolePrivilegeCreateWithoutPrivilegeInputObjectSchema as RolePrivilegeCreateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeCreateWithoutPrivilegeInput.schema';
import { RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema as RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUncheckedCreateWithoutPrivilegeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => RolePrivilegeUpdateWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedUpdateWithoutPrivilegeInputObjectSchema)]),
  create: z.union([z.lazy(() => RolePrivilegeCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema)])
}).strict();
export const RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInput>;
export const RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInputObjectZodSchema = makeSchema();
