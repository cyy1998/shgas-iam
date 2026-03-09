import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './PrivilegeWhereUniqueInput.schema';
import { PrivilegeCreateWithoutRolesInputObjectSchema as PrivilegeCreateWithoutRolesInputObjectSchema } from './PrivilegeCreateWithoutRolesInput.schema';
import { PrivilegeUncheckedCreateWithoutRolesInputObjectSchema as PrivilegeUncheckedCreateWithoutRolesInputObjectSchema } from './PrivilegeUncheckedCreateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PrivilegeCreateWithoutRolesInputObjectSchema), z.lazy(() => PrivilegeUncheckedCreateWithoutRolesInputObjectSchema)])
}).strict();
export const PrivilegeCreateOrConnectWithoutRolesInputObjectSchema: z.ZodType<Prisma.PrivilegeCreateOrConnectWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCreateOrConnectWithoutRolesInput>;
export const PrivilegeCreateOrConnectWithoutRolesInputObjectZodSchema = makeSchema();
