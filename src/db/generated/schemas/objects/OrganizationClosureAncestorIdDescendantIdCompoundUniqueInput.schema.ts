import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  ancestorId: z.number().int(),
  descendantId: z.number().int()
}).strict();
export const OrganizationClosureAncestorIdDescendantIdCompoundUniqueInputObjectSchema: z.ZodType<Prisma.OrganizationClosureAncestorIdDescendantIdCompoundUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureAncestorIdDescendantIdCompoundUniqueInput>;
export const OrganizationClosureAncestorIdDescendantIdCompoundUniqueInputObjectZodSchema = makeSchema();
