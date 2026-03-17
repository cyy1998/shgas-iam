import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateManyCompanyInputObjectSchema as EmploymentCreateManyCompanyInputObjectSchema } from './EmploymentCreateManyCompanyInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => EmploymentCreateManyCompanyInputObjectSchema), z.lazy(() => EmploymentCreateManyCompanyInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const EmploymentCreateManyCompanyInputEnvelopeObjectSchema: z.ZodType<Prisma.EmploymentCreateManyCompanyInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateManyCompanyInputEnvelope>;
export const EmploymentCreateManyCompanyInputEnvelopeObjectZodSchema = makeSchema();
