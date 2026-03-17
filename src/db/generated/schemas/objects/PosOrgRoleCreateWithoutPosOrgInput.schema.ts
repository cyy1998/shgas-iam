import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateNestedOneWithoutPositionOrganizationsInputObjectSchema as RoleCreateNestedOneWithoutPositionOrganizationsInputObjectSchema } from './RoleCreateNestedOneWithoutPositionOrganizationsInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleCreateNestedOneWithoutPositionOrganizationsInputObjectSchema)
}).strict();
export const PosOrgRoleCreateWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateWithoutPosOrgInput>;
export const PosOrgRoleCreateWithoutPosOrgInputObjectZodSchema = makeSchema();
