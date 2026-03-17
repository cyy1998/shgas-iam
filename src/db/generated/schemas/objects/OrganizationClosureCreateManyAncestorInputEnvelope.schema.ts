import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureCreateManyAncestorInputObjectSchema as OrganizationClosureCreateManyAncestorInputObjectSchema } from './OrganizationClosureCreateManyAncestorInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => OrganizationClosureCreateManyAncestorInputObjectSchema), z.lazy(() => OrganizationClosureCreateManyAncestorInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const OrganizationClosureCreateManyAncestorInputEnvelopeObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateManyAncestorInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateManyAncestorInputEnvelope>;
export const OrganizationClosureCreateManyAncestorInputEnvelopeObjectZodSchema = makeSchema();
