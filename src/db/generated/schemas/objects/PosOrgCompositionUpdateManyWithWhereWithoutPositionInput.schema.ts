import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionScalarWhereInputObjectSchema as PosOrgCompositionScalarWhereInputObjectSchema } from './PosOrgCompositionScalarWhereInput.schema';
import { PosOrgCompositionUpdateManyMutationInputObjectSchema as PosOrgCompositionUpdateManyMutationInputObjectSchema } from './PosOrgCompositionUpdateManyMutationInput.schema';
import { PosOrgCompositionUncheckedUpdateManyWithoutPositionInputObjectSchema as PosOrgCompositionUncheckedUpdateManyWithoutPositionInputObjectSchema } from './PosOrgCompositionUncheckedUpdateManyWithoutPositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PosOrgCompositionUpdateManyMutationInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateManyWithoutPositionInputObjectSchema)])
}).strict();
export const PosOrgCompositionUpdateManyWithWhereWithoutPositionInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateManyWithWhereWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateManyWithWhereWithoutPositionInput>;
export const PosOrgCompositionUpdateManyWithWhereWithoutPositionInputObjectZodSchema = makeSchema();
