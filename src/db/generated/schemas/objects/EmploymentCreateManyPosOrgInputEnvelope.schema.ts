import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateManyPosOrgInputObjectSchema as EmploymentCreateManyPosOrgInputObjectSchema } from './EmploymentCreateManyPosOrgInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => EmploymentCreateManyPosOrgInputObjectSchema), z.lazy(() => EmploymentCreateManyPosOrgInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const EmploymentCreateManyPosOrgInputEnvelopeObjectSchema: z.ZodType<Prisma.EmploymentCreateManyPosOrgInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateManyPosOrgInputEnvelope>;
export const EmploymentCreateManyPosOrgInputEnvelopeObjectZodSchema = makeSchema();
