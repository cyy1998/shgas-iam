import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  descendantId: z.number().int(),
  depth: z.number().int()
}).strict();
export const OrganizationClosureCreateManyAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateManyAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateManyAncestorInput>;
export const OrganizationClosureCreateManyAncestorInputObjectZodSchema = makeSchema();
