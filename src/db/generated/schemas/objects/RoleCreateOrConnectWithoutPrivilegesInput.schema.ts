import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleCreateWithoutPrivilegesInputObjectSchema as RoleCreateWithoutPrivilegesInputObjectSchema } from './RoleCreateWithoutPrivilegesInput.schema';
import { RoleUncheckedCreateWithoutPrivilegesInputObjectSchema as RoleUncheckedCreateWithoutPrivilegesInputObjectSchema } from './RoleUncheckedCreateWithoutPrivilegesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => RoleCreateWithoutPrivilegesInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPrivilegesInputObjectSchema)])
}).strict();
export const RoleCreateOrConnectWithoutPrivilegesInputObjectSchema: z.ZodType<Prisma.RoleCreateOrConnectWithoutPrivilegesInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateOrConnectWithoutPrivilegesInput>;
export const RoleCreateOrConnectWithoutPrivilegesInputObjectZodSchema = makeSchema();
