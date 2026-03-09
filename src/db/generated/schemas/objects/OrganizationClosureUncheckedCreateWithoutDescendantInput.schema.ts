import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  ancestorId: z.number().int(),
  depth: z.number().int()
}).strict();
export const OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedCreateWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedCreateWithoutDescendantInput>;
export const OrganizationClosureUncheckedCreateWithoutDescendantInputObjectZodSchema = makeSchema();
