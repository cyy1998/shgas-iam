import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailCreateManyDelegationInputObjectSchema as DelegationDetailCreateManyDelegationInputObjectSchema } from './DelegationDetailCreateManyDelegationInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => DelegationDetailCreateManyDelegationInputObjectSchema), z.lazy(() => DelegationDetailCreateManyDelegationInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const DelegationDetailCreateManyDelegationInputEnvelopeObjectSchema: z.ZodType<Prisma.DelegationDetailCreateManyDelegationInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateManyDelegationInputEnvelope>;
export const DelegationDetailCreateManyDelegationInputEnvelopeObjectZodSchema = makeSchema();
