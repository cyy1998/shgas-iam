import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema';
import { RoleUpdateWithoutPrivilegesInputObjectSchema as RoleUpdateWithoutPrivilegesInputObjectSchema } from './RoleUpdateWithoutPrivilegesInput.schema';
import { RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema as RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema } from './RoleUncheckedUpdateWithoutPrivilegesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => RoleUpdateWithoutPrivilegesInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema)])
}).strict();
export const RoleUpdateToOneWithWhereWithoutPrivilegesInputObjectSchema: z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutPrivilegesInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutPrivilegesInput>;
export const RoleUpdateToOneWithWhereWithoutPrivilegesInputObjectZodSchema = makeSchema();
