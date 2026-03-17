import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionCreateNestedOneWithoutRolesInputObjectSchema as PositionCreateNestedOneWithoutRolesInputObjectSchema } from './PositionCreateNestedOneWithoutRolesInput.schema';
import { RoleCreateNestedOneWithoutPositionsInputObjectSchema as RoleCreateNestedOneWithoutPositionsInputObjectSchema } from './RoleCreateNestedOneWithoutPositionsInput.schema'

const makeSchema = () => z.object({
  position: z.lazy(() => PositionCreateNestedOneWithoutRolesInputObjectSchema),
  role: z.lazy(() => RoleCreateNestedOneWithoutPositionsInputObjectSchema)
}).strict();
export const PositionRoleCreateInputObjectSchema: z.ZodType<Prisma.PositionRoleCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateInput>;
export const PositionRoleCreateInputObjectZodSchema = makeSchema();
