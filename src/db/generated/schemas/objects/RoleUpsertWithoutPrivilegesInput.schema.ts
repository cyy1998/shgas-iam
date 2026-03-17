import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateWithoutPrivilegesInputObjectSchema as RoleUpdateWithoutPrivilegesInputObjectSchema } from './RoleUpdateWithoutPrivilegesInput.schema';
import { RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema as RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema } from './RoleUncheckedUpdateWithoutPrivilegesInput.schema';
import { RoleCreateWithoutPrivilegesInputObjectSchema as RoleCreateWithoutPrivilegesInputObjectSchema } from './RoleCreateWithoutPrivilegesInput.schema';
import { RoleUncheckedCreateWithoutPrivilegesInputObjectSchema as RoleUncheckedCreateWithoutPrivilegesInputObjectSchema } from './RoleUncheckedCreateWithoutPrivilegesInput.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => RoleUpdateWithoutPrivilegesInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema)]),
  create: z.union([z.lazy(() => RoleCreateWithoutPrivilegesInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPrivilegesInputObjectSchema)]),
  where: z.lazy(() => RoleWhereInputObjectSchema).optional()
}).strict();
export const RoleUpsertWithoutPrivilegesInputObjectSchema: z.ZodType<Prisma.RoleUpsertWithoutPrivilegesInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpsertWithoutPrivilegesInput>;
export const RoleUpsertWithoutPrivilegesInputObjectZodSchema = makeSchema();
