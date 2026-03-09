import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutPositionOrganizationsInputObjectSchema as RoleCreateWithoutPositionOrganizationsInputObjectSchema } from './RoleCreateWithoutPositionOrganizationsInput.schema';
import { RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema as RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema } from './RoleUncheckedCreateWithoutPositionOrganizationsInput.schema';
import { RoleCreateOrConnectWithoutPositionOrganizationsInputObjectSchema as RoleCreateOrConnectWithoutPositionOrganizationsInputObjectSchema } from './RoleCreateOrConnectWithoutPositionOrganizationsInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutPositionOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutPositionOrganizationsInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional()
}).strict();
export const RoleCreateNestedOneWithoutPositionOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleCreateNestedOneWithoutPositionOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateNestedOneWithoutPositionOrganizationsInput>;
export const RoleCreateNestedOneWithoutPositionOrganizationsInputObjectZodSchema = makeSchema();
