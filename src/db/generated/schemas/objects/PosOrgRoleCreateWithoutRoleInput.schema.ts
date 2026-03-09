import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateNestedOneWithoutRolesInputObjectSchema as PosOrgCompositionCreateNestedOneWithoutRolesInputObjectSchema } from './PosOrgCompositionCreateNestedOneWithoutRolesInput.schema'

const makeSchema = () => z.object({
  posOrg: z.lazy(() => PosOrgCompositionCreateNestedOneWithoutRolesInputObjectSchema)
}).strict();
export const PosOrgRoleCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateWithoutRoleInput>;
export const PosOrgRoleCreateWithoutRoleInputObjectZodSchema = makeSchema();
