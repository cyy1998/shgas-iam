import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateNestedOneWithoutPositionsInputObjectSchema as RoleCreateNestedOneWithoutPositionsInputObjectSchema } from './RoleCreateNestedOneWithoutPositionsInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleCreateNestedOneWithoutPositionsInputObjectSchema)
}).strict();
export const PositionRoleCreateWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleCreateWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateWithoutPositionInput>;
export const PositionRoleCreateWithoutPositionInputObjectZodSchema = makeSchema();
