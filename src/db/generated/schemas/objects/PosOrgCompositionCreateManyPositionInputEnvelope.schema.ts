import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateManyPositionInputObjectSchema as PosOrgCompositionCreateManyPositionInputObjectSchema } from './PosOrgCompositionCreateManyPositionInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => PosOrgCompositionCreateManyPositionInputObjectSchema), z.lazy(() => PosOrgCompositionCreateManyPositionInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const PosOrgCompositionCreateManyPositionInputEnvelopeObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateManyPositionInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateManyPositionInputEnvelope>;
export const PosOrgCompositionCreateManyPositionInputEnvelopeObjectZodSchema = makeSchema();
