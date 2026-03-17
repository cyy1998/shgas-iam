import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateNestedOneWithoutRolesInputObjectSchema as PosOrgCompositionCreateNestedOneWithoutRolesInputObjectSchema } from './PosOrgCompositionCreateNestedOneWithoutRolesInput.schema';
import { RoleCreateNestedOneWithoutPositionOrganizationsInputObjectSchema as RoleCreateNestedOneWithoutPositionOrganizationsInputObjectSchema } from './RoleCreateNestedOneWithoutPositionOrganizationsInput.schema'

const makeSchema = () => z.object({
  posOrg: z.lazy(() => PosOrgCompositionCreateNestedOneWithoutRolesInputObjectSchema),
  role: z.lazy(() => RoleCreateNestedOneWithoutPositionOrganizationsInputObjectSchema)
}).strict();
export const PosOrgRoleCreateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateInput>;
export const PosOrgRoleCreateInputObjectZodSchema = makeSchema();
