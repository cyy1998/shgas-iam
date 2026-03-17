import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureWhereInputObjectSchema as OrganizationClosureWhereInputObjectSchema } from './OrganizationClosureWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => OrganizationClosureWhereInputObjectSchema).optional(),
  some: z.lazy(() => OrganizationClosureWhereInputObjectSchema).optional(),
  none: z.lazy(() => OrganizationClosureWhereInputObjectSchema).optional()
}).strict();
export const OrganizationClosureListRelationFilterObjectSchema: z.ZodType<Prisma.OrganizationClosureListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureListRelationFilter>;
export const OrganizationClosureListRelationFilterObjectZodSchema = makeSchema();
