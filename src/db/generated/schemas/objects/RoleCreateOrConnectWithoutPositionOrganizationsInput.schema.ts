import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleCreateWithoutPositionOrganizationsInputObjectSchema as RoleCreateWithoutPositionOrganizationsInputObjectSchema } from './RoleCreateWithoutPositionOrganizationsInput.schema';
import { RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema as RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema } from './RoleUncheckedCreateWithoutPositionOrganizationsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => RoleCreateWithoutPositionOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema)])
}).strict();
export const RoleCreateOrConnectWithoutPositionOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleCreateOrConnectWithoutPositionOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateOrConnectWithoutPositionOrganizationsInput>;
export const RoleCreateOrConnectWithoutPositionOrganizationsInputObjectZodSchema = makeSchema();
