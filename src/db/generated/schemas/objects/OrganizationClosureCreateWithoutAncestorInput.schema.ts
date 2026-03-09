import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateNestedOneWithoutDescendantClosuresInputObjectSchema as OrganizationCreateNestedOneWithoutDescendantClosuresInputObjectSchema } from './OrganizationCreateNestedOneWithoutDescendantClosuresInput.schema'

const makeSchema = () => z.object({
  depth: z.number().int(),
  descendant: z.lazy(() => OrganizationCreateNestedOneWithoutDescendantClosuresInputObjectSchema)
}).strict();
export const OrganizationClosureCreateWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateWithoutAncestorInput>;
export const OrganizationClosureCreateWithoutAncestorInputObjectZodSchema = makeSchema();
