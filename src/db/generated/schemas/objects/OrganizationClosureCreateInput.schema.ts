import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateNestedOneWithoutAncestorClosuresInputObjectSchema as OrganizationCreateNestedOneWithoutAncestorClosuresInputObjectSchema } from './OrganizationCreateNestedOneWithoutAncestorClosuresInput.schema';
import { OrganizationCreateNestedOneWithoutDescendantClosuresInputObjectSchema as OrganizationCreateNestedOneWithoutDescendantClosuresInputObjectSchema } from './OrganizationCreateNestedOneWithoutDescendantClosuresInput.schema'

const makeSchema = () => z.object({
  depth: z.number().int(),
  ancestor: z.lazy(() => OrganizationCreateNestedOneWithoutAncestorClosuresInputObjectSchema),
  descendant: z.lazy(() => OrganizationCreateNestedOneWithoutDescendantClosuresInputObjectSchema)
}).strict();
export const OrganizationClosureCreateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateInput>;
export const OrganizationClosureCreateInputObjectZodSchema = makeSchema();
