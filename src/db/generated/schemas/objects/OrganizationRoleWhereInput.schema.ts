import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { BoolFilterObjectSchema as BoolFilterObjectSchema } from './BoolFilter.schema';
import { OrganizationScalarRelationFilterObjectSchema as OrganizationScalarRelationFilterObjectSchema } from './OrganizationScalarRelationFilter.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { RoleScalarRelationFilterObjectSchema as RoleScalarRelationFilterObjectSchema } from './RoleScalarRelationFilter.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const organizationrolewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => OrganizationRoleWhereInputObjectSchema), z.lazy(() => OrganizationRoleWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => OrganizationRoleWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => OrganizationRoleWhereInputObjectSchema), z.lazy(() => OrganizationRoleWhereInputObjectSchema).array()]).optional(),
  organizationId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  isAllSub: z.union([z.lazy(() => BoolFilterObjectSchema), z.boolean()]).optional(),
  organization: z.union([z.lazy(() => OrganizationScalarRelationFilterObjectSchema), z.lazy(() => OrganizationWhereInputObjectSchema)]).optional(),
  role: z.union([z.lazy(() => RoleScalarRelationFilterObjectSchema), z.lazy(() => RoleWhereInputObjectSchema)]).optional()
}).strict();
export const OrganizationRoleWhereInputObjectSchema: z.ZodType<Prisma.OrganizationRoleWhereInput> = organizationrolewhereinputSchema as unknown as z.ZodType<Prisma.OrganizationRoleWhereInput>;
export const OrganizationRoleWhereInputObjectZodSchema = organizationrolewhereinputSchema;
