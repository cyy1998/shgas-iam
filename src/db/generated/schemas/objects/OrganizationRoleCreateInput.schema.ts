import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateNestedOneWithoutRolesInputObjectSchema as OrganizationCreateNestedOneWithoutRolesInputObjectSchema } from './OrganizationCreateNestedOneWithoutRolesInput.schema';
import { RoleCreateNestedOneWithoutOrganizationsInputObjectSchema as RoleCreateNestedOneWithoutOrganizationsInputObjectSchema } from './RoleCreateNestedOneWithoutOrganizationsInput.schema'

const makeSchema = () => z.object({
  isAllSub: z.boolean().optional(),
  organization: z.lazy(() => OrganizationCreateNestedOneWithoutRolesInputObjectSchema),
  role: z.lazy(() => RoleCreateNestedOneWithoutOrganizationsInputObjectSchema)
}).strict();
export const OrganizationRoleCreateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateInput>;
export const OrganizationRoleCreateInputObjectZodSchema = makeSchema();
