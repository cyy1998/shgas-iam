import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleScalarWhereInputObjectSchema as PositionRoleScalarWhereInputObjectSchema } from './PositionRoleScalarWhereInput.schema';
import { PositionRoleUpdateManyMutationInputObjectSchema as PositionRoleUpdateManyMutationInputObjectSchema } from './PositionRoleUpdateManyMutationInput.schema';
import { PositionRoleUncheckedUpdateManyWithoutRoleInputObjectSchema as PositionRoleUncheckedUpdateManyWithoutRoleInputObjectSchema } from './PositionRoleUncheckedUpdateManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PositionRoleUpdateManyMutationInputObjectSchema), z.lazy(() => PositionRoleUncheckedUpdateManyWithoutRoleInputObjectSchema)])
}).strict();
export const PositionRoleUpdateManyWithWhereWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateManyWithWhereWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateManyWithWhereWithoutRoleInput>;
export const PositionRoleUpdateManyWithWhereWithoutRoleInputObjectZodSchema = makeSchema();
