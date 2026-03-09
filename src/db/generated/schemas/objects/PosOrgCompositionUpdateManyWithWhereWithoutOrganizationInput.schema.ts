import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionScalarWhereInputObjectSchema as PosOrgCompositionScalarWhereInputObjectSchema } from './PosOrgCompositionScalarWhereInput.schema';
import { PosOrgCompositionUpdateManyMutationInputObjectSchema as PosOrgCompositionUpdateManyMutationInputObjectSchema } from './PosOrgCompositionUpdateManyMutationInput.schema';
import { PosOrgCompositionUncheckedUpdateManyWithoutOrganizationInputObjectSchema as PosOrgCompositionUncheckedUpdateManyWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUncheckedUpdateManyWithoutOrganizationInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PosOrgCompositionUpdateManyMutationInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateManyWithoutOrganizationInputObjectSchema)])
}).strict();
export const PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInput>;
export const PosOrgCompositionUpdateManyWithWhereWithoutOrganizationInputObjectZodSchema = makeSchema();
