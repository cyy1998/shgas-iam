import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateManyDeptartmentInputObjectSchema as EmploymentCreateManyDeptartmentInputObjectSchema } from './EmploymentCreateManyDeptartmentInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => EmploymentCreateManyDeptartmentInputObjectSchema), z.lazy(() => EmploymentCreateManyDeptartmentInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const EmploymentCreateManyDeptartmentInputEnvelopeObjectSchema: z.ZodType<Prisma.EmploymentCreateManyDeptartmentInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCreateManyDeptartmentInputEnvelope>;
export const EmploymentCreateManyDeptartmentInputEnvelopeObjectZodSchema = makeSchema();
