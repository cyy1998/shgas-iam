import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateNestedOneWithoutOrganizationsInputObjectSchema as RoleCreateNestedOneWithoutOrganizationsInputObjectSchema } from './RoleCreateNestedOneWithoutOrganizationsInput.schema'

const makeSchema = () => z.object({
  isAllSub: z.boolean().optional(),
  role: z.lazy(() => RoleCreateNestedOneWithoutOrganizationsInputObjectSchema)
}).strict();
export const OrganizationRoleCreateWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleCreateWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleCreateWithoutOrganizationInput>;
export const OrganizationRoleCreateWithoutOrganizationInputObjectZodSchema = makeSchema();
