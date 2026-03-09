import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  ancestorId: z.number().int(),
  descendantId: z.number().int(),
  depth: z.number().int()
}).strict();
export const OrganizationClosureCreateManyInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateManyInput>;
export const OrganizationClosureCreateManyInputObjectZodSchema = makeSchema();
