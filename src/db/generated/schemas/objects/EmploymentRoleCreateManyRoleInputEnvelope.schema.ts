import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentRoleCreateManyRoleInputObjectSchema as EmploymentRoleCreateManyRoleInputObjectSchema } from './EmploymentRoleCreateManyRoleInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => EmploymentRoleCreateManyRoleInputObjectSchema), z.lazy(() => EmploymentRoleCreateManyRoleInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const EmploymentRoleCreateManyRoleInputEnvelopeObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateManyRoleInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateManyRoleInputEnvelope>;
export const EmploymentRoleCreateManyRoleInputEnvelopeObjectZodSchema = makeSchema();
