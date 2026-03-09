import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateManyPositionInputObjectSchema as EmploymentCreateManyPositionInputObjectSchema } from './EmploymentCreateManyPositionInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => EmploymentCreateManyPositionInputObjectSchema), z.lazy(() => EmploymentCreateManyPositionInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const EmploymentCreateManyPositionInputEnvelopeObjectSchema: z.ZodType<Prisma.EmploymentCreateManyPositionInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateManyPositionInputEnvelope>;
export const EmploymentCreateManyPositionInputEnvelopeObjectZodSchema = makeSchema();
