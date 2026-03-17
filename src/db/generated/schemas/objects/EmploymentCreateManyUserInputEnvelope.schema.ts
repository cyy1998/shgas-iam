import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateManyUserInputObjectSchema as EmploymentCreateManyUserInputObjectSchema } from './EmploymentCreateManyUserInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => EmploymentCreateManyUserInputObjectSchema), z.lazy(() => EmploymentCreateManyUserInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const EmploymentCreateManyUserInputEnvelopeObjectSchema: z.ZodType<Prisma.EmploymentCreateManyUserInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateManyUserInputEnvelope>;
export const EmploymentCreateManyUserInputEnvelopeObjectZodSchema = makeSchema();
