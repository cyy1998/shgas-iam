import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleCreateManyEmploymentInputObjectSchema as EmploymentRoleCreateManyEmploymentInputObjectSchema } from './EmploymentRoleCreateManyEmploymentInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => EmploymentRoleCreateManyEmploymentInputObjectSchema), z.lazy(() => EmploymentRoleCreateManyEmploymentInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const EmploymentRoleCreateManyEmploymentInputEnvelopeObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateManyEmploymentInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateManyEmploymentInputEnvelope>;
export const EmploymentRoleCreateManyEmploymentInputEnvelopeObjectZodSchema = makeSchema();
