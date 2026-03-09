import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema';
import { RoleUpdateWithoutPositionOrganizationsInputObjectSchema as RoleUpdateWithoutPositionOrganizationsInputObjectSchema } from './RoleUpdateWithoutPositionOrganizationsInput.schema';
import { RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema as RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema } from './RoleUncheckedUpdateWithoutPositionOrganizationsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => RoleUpdateWithoutPositionOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema)])
}).strict();
export const RoleUpdateToOneWithWhereWithoutPositionOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutPositionOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutPositionOrganizationsInput>;
export const RoleUpdateToOneWithWhereWithoutPositionOrganizationsInputObjectZodSchema = makeSchema();
