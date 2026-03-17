import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  descendantId: z.number().int(),
  depth: z.number().int()
}).strict();
export const OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedCreateWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedCreateWithoutAncestorInput>;
export const OrganizationClosureUncheckedCreateWithoutAncestorInputObjectZodSchema = makeSchema();
