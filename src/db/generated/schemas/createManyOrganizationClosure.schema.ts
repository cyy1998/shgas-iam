import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationClosureCreateManyInputObjectSchema as OrganizationClosureCreateManyInputObjectSchema } from './objects/OrganizationClosureCreateManyInput.schema';

export const OrganizationClosureCreateManySchema: z.ZodType<Prisma.OrganizationClosureCreateManyArgs> = z.object({ data: z.union([ OrganizationClosureCreateManyInputObjectSchema, z.array(OrganizationClosureCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureCreateManyArgs>;

export const OrganizationClosureCreateManyZodSchema = z.object({ data: z.union([ OrganizationClosureCreateManyInputObjectSchema, z.array(OrganizationClosureCreateManyInputObjectSchema) ]),  }).strict();