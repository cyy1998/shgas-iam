import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateNestedOneWithoutRolesInputObjectSchema as OrganizationCreateNestedOneWithoutRolesInputObjectSchema } from './OrganizationCreateNestedOneWithoutRolesInput.schema'

const makeSchema = () => z.object({
  isAllSub: z.boolean().optional(),
  organization: z.lazy(() => OrganizationCreateNestedOneWithoutRolesInputObjectSchema)
}).strict();
export const OrganizationRoleCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateWithoutRoleInput>;
export const OrganizationRoleCreateWithoutRoleInputObjectZodSchema = makeSchema();
