import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeCreateWithoutRolesInputObjectSchema as PrivilegeCreateWithoutRolesInputObjectSchema } from './PrivilegeCreateWithoutRolesInput.schema';
import { PrivilegeUncheckedCreateWithoutRolesInputObjectSchema as PrivilegeUncheckedCreateWithoutRolesInputObjectSchema } from './PrivilegeUncheckedCreateWithoutRolesInput.schema';
import { PrivilegeCreateOrConnectWithoutRolesInputObjectSchema as PrivilegeCreateOrConnectWithoutRolesInputObjectSchema } from './PrivilegeCreateOrConnectWithoutRolesInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './PrivilegeWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeCreateWithoutRolesInputObjectSchema), z.lazy(() => PrivilegeUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PrivilegeCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => PrivilegeWhereUniqueInputObjectSchema).optional()
}).strict();
export const PrivilegeCreateNestedOneWithoutRolesInputObjectSchema: z.ZodType<Prisma.PrivilegeCreateNestedOneWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCreateNestedOneWithoutRolesInput>;
export const PrivilegeCreateNestedOneWithoutRolesInputObjectZodSchema = makeSchema();
