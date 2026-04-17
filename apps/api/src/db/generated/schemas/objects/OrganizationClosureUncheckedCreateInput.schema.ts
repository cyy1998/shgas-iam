import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  ancestorId: z.number().int(),
  descendantId: z.number().int(),
  depth: z.number().int()
}).strict();
export const OrganizationClosureUncheckedCreateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedCreateInput>;
export const OrganizationClosureUncheckedCreateInputObjectZodSchema = makeSchema();
