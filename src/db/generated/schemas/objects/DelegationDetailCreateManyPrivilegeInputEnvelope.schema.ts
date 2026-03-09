import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailCreateManyPrivilegeInputObjectSchema as DelegationDetailCreateManyPrivilegeInputObjectSchema } from './DelegationDetailCreateManyPrivilegeInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => DelegationDetailCreateManyPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailCreateManyPrivilegeInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const DelegationDetailCreateManyPrivilegeInputEnvelopeObjectSchema: z.ZodType<Prisma.DelegationDetailCreateManyPrivilegeInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateManyPrivilegeInputEnvelope>;
export const DelegationDetailCreateManyPrivilegeInputEnvelopeObjectZodSchema = makeSchema();
