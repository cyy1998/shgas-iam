import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureAncestorIdDescendantIdCompoundUniqueInputObjectSchema as OrganizationClosureAncestorIdDescendantIdCompoundUniqueInputObjectSchema } from './OrganizationClosureAncestorIdDescendantIdCompoundUniqueInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  ancestorId_descendantId: z.lazy(() => OrganizationClosureAncestorIdDescendantIdCompoundUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationClosureWhereUniqueInputObjectSchema: z.ZodType<Prisma.OrganizationClosureWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureWhereUniqueInput>;
export const OrganizationClosureWhereUniqueInputObjectZodSchema = makeSchema();
