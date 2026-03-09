import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeScalarWhereInputObjectSchema as RolePrivilegeScalarWhereInputObjectSchema } from './RolePrivilegeScalarWhereInput.schema';
import { RolePrivilegeUpdateManyMutationInputObjectSchema as RolePrivilegeUpdateManyMutationInputObjectSchema } from './RolePrivilegeUpdateManyMutationInput.schema';
import { RolePrivilegeUncheckedUpdateManyWithoutRoleInputObjectSchema as RolePrivilegeUncheckedUpdateManyWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedUpdateManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => RolePrivilegeUpdateManyMutationInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedUpdateManyWithoutRoleInputObjectSchema)])
}).strict();
export const RolePrivilegeUpdateManyWithWhereWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateManyWithWhereWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateManyWithWhereWithoutRoleInput>;
export const RolePrivilegeUpdateManyWithWhereWithoutRoleInputObjectZodSchema = makeSchema();
