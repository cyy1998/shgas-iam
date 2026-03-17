import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionCreateNestedOneWithoutRolesInputObjectSchema as PositionCreateNestedOneWithoutRolesInputObjectSchema } from './PositionCreateNestedOneWithoutRolesInput.schema'

const makeSchema = () => z.object({
  position: z.lazy(() => PositionCreateNestedOneWithoutRolesInputObjectSchema)
}).strict();
export const PositionRoleCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCreateWithoutRoleInput>;
export const PositionRoleCreateWithoutRoleInputObjectZodSchema = makeSchema();
