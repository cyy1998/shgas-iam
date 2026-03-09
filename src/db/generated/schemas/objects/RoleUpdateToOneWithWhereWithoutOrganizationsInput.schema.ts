import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema';
import { RoleUpdateWithoutOrganizationsInputObjectSchema as RoleUpdateWithoutOrganizationsInputObjectSchema } from './RoleUpdateWithoutOrganizationsInput.schema';
import { RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema as RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema } from './RoleUncheckedUpdateWithoutOrganizationsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => RoleUpdateWithoutOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema)])
}).strict();
export const RoleUpdateToOneWithWhereWithoutOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateToOneWithWhereWithoutOrganizationsInput>;
export const RoleUpdateToOneWithWhereWithoutOrganizationsInputObjectZodSchema = makeSchema();
