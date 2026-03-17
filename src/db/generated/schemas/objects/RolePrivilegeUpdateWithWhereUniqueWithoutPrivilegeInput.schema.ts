import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeUpdateWithoutPrivilegeInputObjectSchema as RolePrivilegeUpdateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUpdateWithoutPrivilegeInput.schema';
import { RolePrivilegeUncheckedUpdateWithoutPrivilegeInputObjectSchema as RolePrivilegeUncheckedUpdateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUncheckedUpdateWithoutPrivilegeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => RolePrivilegeUpdateWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedUpdateWithoutPrivilegeInputObjectSchema)])
}).strict();
export const RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInput>;
export const RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInputObjectZodSchema = makeSchema();
