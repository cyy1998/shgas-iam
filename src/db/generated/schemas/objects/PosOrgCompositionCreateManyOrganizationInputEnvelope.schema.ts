import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateManyOrganizationInputObjectSchema as PosOrgCompositionCreateManyOrganizationInputObjectSchema } from './PosOrgCompositionCreateManyOrganizationInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PosOrgCompositionCreateManyOrganizationInputObjectSchema), z.lazy(() => PosOrgCompositionCreateManyOrganizationInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PosOrgCompositionCreateManyOrganizationInputEnvelopeObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateManyOrganizationInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateManyOrganizationInputEnvelope>;
export const PosOrgCompositionCreateManyOrganizationInputEnvelopeObjectZodSchema = makeSchema();
