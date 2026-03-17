import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutPrivilegesInputObjectSchema as RoleCreateWithoutPrivilegesInputObjectSchema } from './RoleCreateWithoutPrivilegesInput.schema';
import { RoleUncheckedCreateWithoutPrivilegesInputObjectSchema as RoleUncheckedCreateWithoutPrivilegesInputObjectSchema } from './RoleUncheckedCreateWithoutPrivilegesInput.schema';
import { RoleCreateOrConnectWithoutPrivilegesInputObjectSchema as RoleCreateOrConnectWithoutPrivilegesInputObjectSchema } from './RoleCreateOrConnectWithoutPrivilegesInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutPrivilegesInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPrivilegesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutPrivilegesInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional()
}).strict();
export const RoleCreateNestedOneWithoutPrivilegesInputObjectSchema: z.ZodType<Prisma.RoleCreateNestedOneWithoutPrivilegesInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateNestedOneWithoutPrivilegesInput>;
export const RoleCreateNestedOneWithoutPrivilegesInputObjectZodSchema = makeSchema();
