import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeScalarWhereInputObjectSchema as RolePrivilegeScalarWhereInputObjectSchema } from './RolePrivilegeScalarWhereInput.schema';
import { RolePrivilegeUpdateManyMutationInputObjectSchema as RolePrivilegeUpdateManyMutationInputObjectSchema } from './RolePrivilegeUpdateManyMutationInput.schema';
import { RolePrivilegeUncheckedUpdateManyWithoutPrivilegeInputObjectSchema as RolePrivilegeUncheckedUpdateManyWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUncheckedUpdateManyWithoutPrivilegeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => RolePrivilegeUpdateManyMutationInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedUpdateManyWithoutPrivilegeInputObjectSchema)])
}).strict();
export const RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInput>;
export const RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInputObjectZodSchema = makeSchema();
