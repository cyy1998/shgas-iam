import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateNestedOneWithoutAncestorClosuresInputObjectSchema as OrganizationCreateNestedOneWithoutAncestorClosuresInputObjectSchema } from './OrganizationCreateNestedOneWithoutAncestorClosuresInput.schema'

const makeSchema = () => z.object({
  depth: z.number().int(),
  ancestor: z.lazy(() => OrganizationCreateNestedOneWithoutAncestorClosuresInputObjectSchema)
}).strict();
export const OrganizationClosureCreateWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateWithoutDescendantInput>;
export const OrganizationClosureCreateWithoutDescendantInputObjectZodSchema = makeSchema();
