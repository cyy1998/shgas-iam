import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleScalarWhereInputObjectSchema as PositionRoleScalarWhereInputObjectSchema } from './PositionRoleScalarWhereInput.schema';
import { PositionRoleUpdateManyMutationInputObjectSchema as PositionRoleUpdateManyMutationInputObjectSchema } from './PositionRoleUpdateManyMutationInput.schema';
import { PositionRoleUncheckedUpdateManyWithoutPositionInputObjectSchema as PositionRoleUncheckedUpdateManyWithoutPositionInputObjectSchema } from './PositionRoleUncheckedUpdateManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PositionRoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PositionRoleUpdateManyMutationInputObjectSchema), z.lazy(() => PositionRoleUncheckedUpdateManyWithoutPositionInputObjectSchema)])
}).strict();
export const PositionRoleUpdateManyWithWhereWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateManyWithWhereWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateManyWithWhereWithoutPositionInput>;
export const PositionRoleUpdateManyWithWhereWithoutPositionInputObjectZodSchema = makeSchema();
