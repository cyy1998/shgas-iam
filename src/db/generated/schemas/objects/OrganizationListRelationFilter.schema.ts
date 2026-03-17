import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  some: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  none: z.lazy(() => OrganizationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationListRelationFilterObjectSchema: z.ZodType<Prisma.OrganizationListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationListRelationFilter>;
export const OrganizationListRelationFilterObjectZodSchema = makeSchema();
