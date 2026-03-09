import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateWithoutPositionOrganizationsInputObjectSchema as RoleUpdateWithoutPositionOrganizationsInputObjectSchema } from './RoleUpdateWithoutPositionOrganizationsInput.schema';
import { RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema as RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema } from './RoleUncheckedUpdateWithoutPositionOrganizationsInput.schema';
import { RoleCreateWithoutPositionOrganizationsInputObjectSchema as RoleCreateWithoutPositionOrganizationsInputObjectSchema } from './RoleCreateWithoutPositionOrganizationsInput.schema';
import { RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema as RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema } from './RoleUncheckedCreateWithoutPositionOrganizationsInput.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => RoleUpdateWithoutPositionOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema)]),
  create: z.union([z.lazy(() => RoleCreateWithoutPositionOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema)]),
  where: z.lazy(() => RoleWhereInputObjectSchema).optional()
}).strict();
export const RoleUpsertWithoutPositionOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleUpsertWithoutPositionOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpsertWithoutPositionOrganizationsInput>;
export const RoleUpsertWithoutPositionOrganizationsInputObjectZodSchema = makeSchema();
