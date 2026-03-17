import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutPrivilegesInputObjectSchema as RoleCreateWithoutPrivilegesInputObjectSchema } from './RoleCreateWithoutPrivilegesInput.schema';
import { RoleUncheckedCreateWithoutPrivilegesInputObjectSchema as RoleUncheckedCreateWithoutPrivilegesInputObjectSchema } from './RoleUncheckedCreateWithoutPrivilegesInput.schema';
import { RoleCreateOrConnectWithoutPrivilegesInputObjectSchema as RoleCreateOrConnectWithoutPrivilegesInputObjectSchema } from './RoleCreateOrConnectWithoutPrivilegesInput.schema';
import { RoleUpsertWithoutPrivilegesInputObjectSchema as RoleUpsertWithoutPrivilegesInputObjectSchema } from './RoleUpsertWithoutPrivilegesInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleUpdateToOneWithWhereWithoutPrivilegesInputObjectSchema as RoleUpdateToOneWithWhereWithoutPrivilegesInputObjectSchema } from './RoleUpdateToOneWithWhereWithoutPrivilegesInput.schema';
import { RoleUpdateWithoutPrivilegesInputObjectSchema as RoleUpdateWithoutPrivilegesInputObjectSchema } from './RoleUpdateWithoutPrivilegesInput.schema';
import { RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema as RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema } from './RoleUncheckedUpdateWithoutPrivilegesInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutPrivilegesInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPrivilegesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutPrivilegesInputObjectSchema).optional(),
  upsert: z.lazy(() => RoleUpsertWithoutPrivilegesInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => RoleUpdateToOneWithWhereWithoutPrivilegesInputObjectSchema), z.lazy(() => RoleUpdateWithoutPrivilegesInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPrivilegesInputObjectSchema)]).optional()
}).strict();
export const RoleUpdateOneRequiredWithoutPrivilegesNestedInputObjectSchema: z.ZodType<Prisma.RoleUpdateOneRequiredWithoutPrivilegesNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateOneRequiredWithoutPrivilegesNestedInput>;
export const RoleUpdateOneRequiredWithoutPrivilegesNestedInputObjectZodSchema = makeSchema();
