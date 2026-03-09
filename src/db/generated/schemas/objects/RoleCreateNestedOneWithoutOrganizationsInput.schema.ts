import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutOrganizationsInputObjectSchema as RoleCreateWithoutOrganizationsInputObjectSchema } from './RoleCreateWithoutOrganizationsInput.schema';
import { RoleUncheckedCreateWithoutOrganizationsInputObjectSchema as RoleUncheckedCreateWithoutOrganizationsInputObjectSchema } from './RoleUncheckedCreateWithoutOrganizationsInput.schema';
import { RoleCreateOrConnectWithoutOrganizationsInputObjectSchema as RoleCreateOrConnectWithoutOrganizationsInputObjectSchema } from './RoleCreateOrConnectWithoutOrganizationsInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutOrganizationsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutOrganizationsInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional()
}).strict();
export const RoleCreateNestedOneWithoutOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleCreateNestedOneWithoutOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateNestedOneWithoutOrganizationsInput>;
export const RoleCreateNestedOneWithoutOrganizationsInputObjectZodSchema = makeSchema();
