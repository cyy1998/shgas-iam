import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureCreateManyDescendantInputObjectSchema as OrganizationClosureCreateManyDescendantInputObjectSchema } from './OrganizationClosureCreateManyDescendantInput.schema'

const makeSchema = () => z.object({
  data: z.union([z.lazy(() => OrganizationClosureCreateManyDescendantInputObjectSchema), z.lazy(() => OrganizationClosureCreateManyDescendantInputObjectSchema).array()]),
  skipDuplicates: z.boolean().optional()
}).strict();
export const OrganizationClosureCreateManyDescendantInputEnvelopeObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateManyDescendantInputEnvelope> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateManyDescendantInputEnvelope>;
export const OrganizationClosureCreateManyDescendantInputEnvelopeObjectZodSchema = makeSchema();
